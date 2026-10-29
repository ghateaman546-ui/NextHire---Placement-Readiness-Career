const mongoose = require('mongoose');

/**
 * User feedback submissions — bug reports, feature requests, and general
 * feedback about the platform. Reviewed by admins from the Feedback panel.
 */
const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    category: {
      type: String,
      enum: ['bug', 'feature-request', 'content', 'general'],
      default: 'general',
    },
    rating: { type: Number, min: 1, max: 5 },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
    status: {
      type: String,
      enum: ['new', 'reviewed', 'resolved'],
      default: 'new',
    },
  },
  { timestamps: true }
);

feedbackSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
