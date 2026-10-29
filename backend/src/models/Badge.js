const mongoose = require('mongoose');
const { Schema } = mongoose;

const badgeSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    iconUrl: { type: String, default: '' },
    criteria: { type: { type: String, enum: ['streak', 'questions-solved', 'quiz-score', 'resume-score', 'custom'] }, threshold: Number },
    pointsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Badge', badgeSchema);
