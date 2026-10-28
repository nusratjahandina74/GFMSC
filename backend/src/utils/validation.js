import mongoose from 'mongoose';
export const isValidId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
};