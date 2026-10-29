const mongoose = require('mongoose');
const { Schema } = mongoose;

const noteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    contentMarkdown: { type: String, default: '' },
    tags: [{ type: String }],
    isPinned: { type: Boolean, default: false },
    isBookmarked: { type: Boolean, default: false },
    linkedQuestion: { type: Schema.Types.ObjectId, ref: 'Question' },
  },
  { timestamps: true }
);

noteSchema.index({ userId: 1, isPinned: -1, updatedAt: -1 });

module.exports = mongoose.model('Note', noteSchema);
