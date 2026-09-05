import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from '../config/env';

const UPLOAD_ROOT = path.resolve(process.cwd(), env.uploads.dir);
const CSV_DIR = path.join(UPLOAD_ROOT, 'csv');
const ATTACHMENT_DIR = path.join(UPLOAD_ROOT, 'attachments');

[UPLOAD_ROOT, CSV_DIR, ATTACHMENT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Explicit allow-list. Executables, scripts, and unknown types are rejected
// outright — uploaded files are NEVER executed by this service.
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]);

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png']);

const ALLOWED_CSV_MIME_TYPES = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain']);

function safeRandomName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const random = crypto.randomBytes(16).toString('hex');
  return `${random}${ext}`;
}

function attachmentFileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext) || !ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
    cb(new Error(`File type not allowed: ${file.originalname} (${file.mimetype})`));
    return;
  }
  cb(null, true);
}

function csvFileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.csv' || !ALLOWED_CSV_MIME_TYPES.has(file.mimetype)) {
    cb(new Error(`Only .csv files are allowed. Received: ${file.originalname} (${file.mimetype})`));
    return;
  }
  cb(null, true);
}

export const uploadCsv = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CSV_DIR),
    filename: (_req, file, cb) => cb(null, safeRandomName(file.originalname)),
  }),
  fileFilter: csvFileFilter,
  limits: { fileSize: env.uploads.maxCsvSizeMb * 1024 * 1024 },
});

export const uploadAttachment = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ATTACHMENT_DIR),
    filename: (_req, file, cb) => cb(null, safeRandomName(file.originalname)),
  }),
  fileFilter: attachmentFileFilter,
  limits: { fileSize: env.uploads.maxAttachmentSizeMb * 1024 * 1024 },
});

export const UPLOAD_PATHS = { UPLOAD_ROOT, CSV_DIR, ATTACHMENT_DIR };
