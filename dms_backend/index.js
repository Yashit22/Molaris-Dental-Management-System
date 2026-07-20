import express from "express";
import http from "http";
import dotenv from "dotenv";
import cors from "cors";

// Configurations
import { connectAnalyticsDb } from "./config/analyticsDb.js";

// Middleware
import { authenticate } from './middleware/auth.js';
import { resolveTenant } from './middleware/resolveTenant.js';

// Routes
import patientRoutes from "./routes/patient.routes.js";
import visitRoutes from "./routes/visit.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import labRoutes from './routes/lab.routes.js';
import vendorRoutes from './routes/vendor.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import userRoutes from './routes/user.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import clinicalFindingRoutes from './routes/clinicalFinding.routes.js';
import diagnosisRoutes from './routes/diagnosis.routes.js';
import suggestedTreatmentRoutes from './routes/suggestedTreatment.routes.js';
import medicineRoutes from './routes/medicine.routes.js';
import fileRoutes from './routes/files.js';
import reportRoutes from './routes/report.routes.js';
import assessmentRoutes from './routes/assessment.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import emailRoutes from './routes/email.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import documentRoutes from './routes/documents.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import integrationRoutes from './routes/integration.routes.js';
import creditsRoutes from './routes/credits.routes.js';
import superAdminRoutes from './routes/superAdmin.routes.js';
import { startAppointmentStatusJob } from './services/appointmentStatusJob.js';
import { handlePollResponse } from './controllers/whatsapp.controller.js';
import { attachReportStreamSocket } from './ws/reportStream.ws.js';

dotenv.config();

const app = express();

// Trust the first proxy hop so req.ip reflects the real client IP
// (required for accurate rate limiting and audit logs behind a load balancer)
app.set('trust proxy', 1);

// Basic Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", uptime: process.uptime() });
});

// Authentication & Public Routes
app.use('/api/users', userRoutes);

// Connect Desk — super admin panel (separate JWT, no tenant context needed)
app.use('/api/connect-desk', superAdminRoutes);

// Webhook Routes (public, no auth required)
// WAAPI sends feedback webhook without bearer token; validation happens inside handler
app.post('/api/whatsapp/feedback/webhook', handlePollResponse);

// Public booking routes (no auth — tenantId from URL param)
app.use('/api/public/:tenantId/booking', bookingRoutes);

// Multi-Tenant Aware Routes
// resolveTenant must come AFTER authenticate because it relies on req.user.tenantId
const tenantStack = [authenticate, resolveTenant];

app.use("/api/patients",     tenantStack, patientRoutes);
app.use("/api/visits",       tenantStack, visitRoutes);
app.use("/api/appointments", tenantStack, appointmentRoutes);
app.use("/api",              tenantStack, invoiceRoutes);
app.use('/api/labs',         tenantStack, labRoutes);
app.use('/api/vendors',      tenantStack, vendorRoutes);
app.use('/api/inventory',    tenantStack, inventoryRoutes);
app.use('/api/doctors',              tenantStack, doctorRoutes);
app.use('/api/clinical-findings',    tenantStack, clinicalFindingRoutes);
app.use('/api/diagnoses',            tenantStack, diagnosisRoutes);
app.use('/api/suggested-treatments', tenantStack, suggestedTreatmentRoutes);
app.use('/api/medicines',            tenantStack, medicineRoutes);
app.use('/api/files',                tenantStack, fileRoutes);
app.use('/api/report',               tenantStack, reportRoutes);
app.use('/api/assessment',           tenantStack, assessmentRoutes);
app.use('/api/analytics',            tenantStack, analyticsRoutes);
app.use('/api/whatsapp',             tenantStack, whatsappRoutes);
app.use('/api/feedback',             tenantStack, feedbackRoutes);
app.use('/api/email',                tenantStack, emailRoutes);
app.use('/api/settings',             tenantStack, settingsRoutes);
app.use('/api/documents',            tenantStack, documentRoutes);
app.use('/api/integrations',         tenantStack, integrationRoutes);
// Credits live in the analytics DB, keyed by tenantId — only needs authenticate.
app.use('/api/credits',              authenticate, creditsRoutes);


// Global error handler
app.use((err, req, res, next) => {
  console.error('[Global Error Path]:', req.path, err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;

// Explicit HTTP server so we can attach the WebSocket upgrade handler.
const server = http.createServer(app);

// Live report transcription relay (WS at /api/report/stream)
attachReportStreamSocket(server);

// Connect to Analytics DB before starting the server
async function startServer() {
  try {
    await connectAnalyticsDb();
    server.listen(PORT, () => {
      console.log(`🚀 DMS Multi-Tenant Backend running on port ${PORT}`);
      // Start background appointment status transitions
      startAppointmentStatusJob();
    });
  } catch (err) {
    console.error('❌ PANIC: Could not connect to Analytics DB. Server aborted.', err.message);
    process.exit(1);
  }
}

startServer();
