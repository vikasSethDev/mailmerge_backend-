import { Types } from 'mongoose';
import { AttachmentModel, IAttachment } from '../models/Attachment.model';
import { ApiError } from '../utils/asyncHandler.util';
import fs from 'fs/promises';

class AttachmentService {
  async saveUploaded(file: Express.Multer.File): Promise<IAttachment> {
    return AttachmentModel.create({
      originalName: file.originalname,
      storedName: file.filename,
      path: file.path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  }

  async getByIds(ids: string[]): Promise<IAttachment[]> {
    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    return AttachmentModel.find({ _id: { $in: validIds } });
  }

  async getById(id: string): Promise<IAttachment> {
    if (!Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid attachment id');
    const attachment = await AttachmentModel.findById(id);
    if (!attachment) throw new ApiError(404, 'Attachment not found');
    return attachment;
  }

  /**
   * Resolves a per-recipient attachment file name (from a CSV column, e.g. "Rahul.pdf")
   * against previously uploaded attachments by matching original file name.
   * Returns null if no matching attachment was uploaded for this recipient.
   */
  async resolveByOriginalName(fileName: string): Promise<IAttachment | null> {
    if (!fileName) return null;
    return AttachmentModel.findOne({ originalName: fileName }).sort({ createdAt: -1 });
  }

  async remove(id: string): Promise<void> {
    const attachment = await this.getById(id);
    await fs.unlink(attachment.path).catch(() => undefined);
    await AttachmentModel.findByIdAndDelete(id);
  }
}

export const attachmentService = new AttachmentService();
