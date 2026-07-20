import { logEvent } from '../services/analyticsLogger.js';

// ─── Poll Template CRUD ───────────────────────────────────────────────────────

// GET /api/feedback/poll-templates
export async function getPollTemplates(req, res) {
  const { PollTemplate } = req.tenantModels;
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.language) filter.language = req.query.language;

    const templates = await PollTemplate.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/feedback/poll-templates/:id
export async function getPollTemplate(req, res) {
  const { PollTemplate } = req.tenantModels;
  try {
    const template = await PollTemplate.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).lean();
    if (!template) {
      return res.status(404).json({ error: 'Poll template not found' });
    }
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/feedback/poll-templates
export async function createPollTemplate(req, res) {
  const { PollTemplate } = req.tenantModels;
  try {
    const { name, options, sendDelayMinutes, isActive, language } = req.body;

    // Validate options
    if (!Array.isArray(options) || options.length !== 5) {
      return res.status(400).json({ error: 'Options must contain exactly 5 items' });
    }

    const validFormat = options.every((opt, idx) => {
      const expected = idx + 1;
      return new RegExp(`^${expected}\\s-`).test(opt);
    });

    if (!validFormat) {
      return res.status(400).json({
        error: 'Options must start with "1 -", "2 -", "3 -", "4 -", "5 -"',
      });
    }

    // One ACTIVE poll per (tenant, language) — upsert so re-saving a language replaces
    // its poll instead of accumulating orphans the resolver can never pick.
    //
    // Match on isActive too: tenants can carry deactivated duplicates from before polls
    // were language-aware, and matching without it would grab an arbitrary dead row and
    // resurrect it (leaving the live poll stale).
    const lang = language || 'en';
    const saved = await PollTemplate.findOneAndUpdate(
      { tenantId: req.user.tenantId, language: lang, isActive: true },
      {
        tenantId: req.user.tenantId,
        language: lang,
        name,
        options,
        sendDelayMinutes: sendDelayMinutes ?? 15,
        isActive: isActive !== false,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    logEvent(req.user.tenantId, 'poll_template_created', {
      templateId: saved._id,
      name: saved.name,
    });

    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// PUT /api/feedback/poll-templates/:id
export async function updatePollTemplate(req, res) {
  const { PollTemplate } = req.tenantModels;
  try {
    const { name, options, sendDelayMinutes, isActive, language } = req.body;

    // Validate options if provided
    if (options) {
      if (!Array.isArray(options) || options.length !== 5) {
        return res.status(400).json({ error: 'Options must contain exactly 5 items' });
      }

      const validFormat = options.every((opt, idx) => {
        const expected = idx + 1;
        return new RegExp(`^${expected}\\s-`).test(opt);
      });

      if (!validFormat) {
        return res.status(400).json({
          error: 'Options must start with "1 -", "2 -", "3 -", "4 -", "5 -"',
        });
      }
    }

    const template = await PollTemplate.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.user.tenantId,
      },
      {
        name,
        options,
        sendDelayMinutes,
        isActive,
        ...(language ? { language } : {}),
      },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ error: 'Poll template not found' });
    }

    logEvent(req.user.tenantId, 'poll_template_updated', {
      templateId: template._id,
      name: template.name,
    });

    res.json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// DELETE /api/feedback/poll-templates/:id
export async function deletePollTemplate(req, res) {
  const { PollTemplate } = req.tenantModels;
  try {
    const template = await PollTemplate.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });

    if (!template) {
      return res.status(404).json({ error: 'Poll template not found' });
    }

    logEvent(req.user.tenantId, 'poll_template_deleted', {
      templateId: template._id,
      name: template.name,
    });

    res.json({ message: 'Poll template deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}



// GET /api/feedback/responses
// Query params: feedbackType, from (phone), startDate, endDate
export async function getPollResponses(req, res) {
  const { PollResponse } = req.tenantModels;
  try {
    const { feedbackType, from, startDate, endDate } = req.query;

    const query = { tenantId: req.user.tenantId };

    if (feedbackType) {
      query.feedbackType = feedbackType;
    }
    if (from) {
      query.from = from;
    }
    if (startDate || endDate) {
      query.respondedAt = {};
      if (startDate) {
        query.respondedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.respondedAt.$lte = new Date(endDate);
      }
    }

    const responses = await PollResponse.find(query).sort({ respondedAt: -1 }).lean();
    res.json({ count: responses.length, data: responses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/feedback/responses/stats
// Returns aggregated feedback stats
export async function getFeedbackStats(req, res) {
  const { PollResponse } = req.tenantModels;
  try {
    const { startDate, endDate } = req.query;

    const query = { tenantId: req.user.tenantId };
    if (startDate || endDate) {
      query.respondedAt = {};
      if (startDate) {
        query.respondedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.respondedAt.$lte = new Date(endDate);
      }
    }

    const stats = await PollResponse.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$feedbackType',
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const ratingBreakdown = await PollResponse.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    res.json({
      byFeedbackType: stats,
      byRating: ratingBreakdown,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
