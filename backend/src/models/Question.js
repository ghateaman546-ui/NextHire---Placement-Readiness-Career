const mongoose = require('mongoose');
const { Schema } = mongoose;

const userQuestionStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['not-started', 'attempted', 'completed'], default: 'not-started' },
    isBookmarked: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    completedAt: { type: Date },
  },
  { _id: false }
);

const questionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
    topic: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    companyTags: [{ type: Schema.Types.ObjectId, ref: 'Company' }],
    leetcodeLink: { type: String, default: '' },
    youtubeSolutionLink: { type: String, default: '' },
    problemStatement: { type: String, default: '' },
    userStates: [userQuestionStateSchema],
    solvedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

questionSchema.index({ topic: 1, difficulty: 1 });
questionSchema.index({ companyTags: 1 });
questionSchema.index({ 'userStates.userId': 1 });

module.exports = mongoose.model('Question', questionSchema);
