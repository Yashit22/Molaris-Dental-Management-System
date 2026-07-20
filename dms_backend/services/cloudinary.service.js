import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

function configure(tenantConfig) {
  cloudinary.config({
    cloud_name: tenantConfig.cloudinaryCloudName,
    api_key:    tenantConfig.cloudinaryApiKey,
    api_secret: tenantConfig.cloudinaryApiSecret,
    secure:     true,
  });
}

/**
 * Uploads a file buffer to Cloudinary.
 * @param {Buffer}   fileBuffer
 * @param {string}   fileName
 * @param {string}   folder      Cloudinary folder path e.g. 'dms/whatsapp-media'
 * @param {string[]} tags
 * @param {object}   tenantConfig  from req.tenantConfig
 * @returns {{ publicId, url, type, fileName }}
 */
export async function uploadFile(fileBuffer, fileName, folder, tags, tenantConfig) {
  configure(tenantConfig);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        tags,
        resource_type: 'auto',
        public_id: `${Date.now()}_${fileName.replace(/\s+/g, '_')}`,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          publicId: result.public_id,
          url:      result.secure_url,
          type:     result.resource_type === 'image' ? 'image' : 'document',
          fileName,
        });
      }
    );
    Readable.from(fileBuffer).pipe(uploadStream);
  });
}

/**
 * Deletes a file from Cloudinary by its public_id.
 */
export async function deleteFile(publicId, tenantConfig) {
  configure(tenantConfig);
  return cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
}

/**
 * Extracts the Cloudinary public_id from a secure delivery URL.
 * e.g. https://res.cloudinary.com/<cloud>/image/upload/v1699.../dms/branding/123_logo.png
 *      → dms/branding/123_logo
 * Returns null if the URL is not a recognisable Cloudinary upload URL.
 */
export function publicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/\/upload\/(?:[^/]+\/)*?v\d+\/(.+)$/);
  if (!m) return null;
  // Strip the file extension from the last path segment only.
  return m[1].replace(/\.[^./]+$/, '');
}

/**
 * Best-effort delete of a Cloudinary asset given its delivery URL.
 * Never throws — resolves to true on success, false on any failure or if the
 * URL is not a Cloudinary URL (e.g. an external/legacy image). Callers use this
 * to clean up a replaced/removed image without blocking the main action.
 */
export async function deleteFileByUrl(url, tenantConfig) {
  const publicId = publicIdFromUrl(url);
  if (!publicId) return false;
  try {
    await deleteFile(publicId, tenantConfig);
    return true;
  } catch (err) {
    console.error('[cloudinary] cleanup delete failed for', publicId, '-', err.message);
    return false;
  }
}
