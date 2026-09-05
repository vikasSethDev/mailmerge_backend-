import { Types } from 'mongoose';
import { ContactListModel, IContactList } from '../models/ContactList.model';
import { ContactModel } from '../models/Contact.model';
import { ApiError } from '../utils/asyncHandler.util';

export interface ContactListInput {
  name: string;
  description?: string;
  color?: string;
}

class ContactListService {
  async create(input: ContactListInput, createdBy?: string): Promise<IContactList> {
    return ContactListModel.create({ ...input, createdBy });
  }

  async list(): Promise<(IContactList & { memberCount: number })[]> {
    const lists = await ContactListModel.find().sort({ createdAt: -1 }).lean();
    const counts = await ContactModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { excluded: false } },
      { $unwind: '$lists' },
      { $group: { _id: '$lists', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return lists.map((l) => ({ ...l, memberCount: countMap.get(String(l._id)) ?? 0 })) as unknown as (IContactList & {
      memberCount: number;
    })[];
  }

  private async requireById(id: string): Promise<IContactList> {
    if (!Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid list id');
    const list = await ContactListModel.findById(id);
    if (!list) throw new ApiError(404, 'Contact list not found');
    return list;
  }

  async update(id: string, input: Partial<ContactListInput>): Promise<IContactList> {
    const list = await this.requireById(id);
    if (input.name !== undefined) list.name = input.name;
    if (input.description !== undefined) list.description = input.description;
    if (input.color !== undefined) list.color = input.color;
    await list.save();
    return list;
  }

  async remove(id: string): Promise<void> {
    await this.requireById(id);
    await ContactListModel.findByIdAndDelete(id);
    await ContactModel.updateMany({ lists: id }, { $pull: { lists: id } });
  }

  /** Adds/removes a set of contacts to/from a set of lists in one bulk operation (used by the Contacts page). */
  async setMembership(contactIds: string[], listIds: string[], action: 'add' | 'remove'): Promise<number> {
    const validContactIds = contactIds.filter((id) => Types.ObjectId.isValid(id));
    const validListIds = listIds.filter((id) => Types.ObjectId.isValid(id));
    if (validContactIds.length === 0 || validListIds.length === 0) return 0;

    const op = action === 'add' ? { $addToSet: { lists: { $each: validListIds } } } : { $pull: { lists: { $in: validListIds } } };
    const result = await ContactModel.updateMany({ _id: { $in: validContactIds } }, op);
    return result.modifiedCount ?? 0;
  }
}

export const contactListService = new ContactListService();