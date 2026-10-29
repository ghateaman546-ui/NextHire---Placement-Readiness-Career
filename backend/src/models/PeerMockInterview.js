const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * PeerMockInterview Schema
 * A student-to-student mock interview: one student schedules an open slot
 * (topic/domain + date/time), a second student joins it, and after the
 * session both sides can fill out a peer evaluation feedback form for the
 * OTHER person. This is distinct from MockInterview.js, which is the
 * solo AI-graded practice mode.
 *
 * Lifecycle: open -> matched -> completed (or cancelled at any point
 * before completion).
 */
const peerFeedbackSchema = new Schema(
  {
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 1-5 star style ratings, kept simple and structured for aggregation
    communicationRating: { type: Number, min: 1, max: 5, required: true },
    technicalRating: { type: Number, min: 1, max: 5, required: true },
    confidenceRating: { type: Number, min: 1, max: 5, required: true },
    overallRating: { type: Number, min: 1, max: 5, required: true },
    strengths: { type: String, default: '' },
    areasToImprove: { type: String, default: '' },
    additionalComments: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const peerMockInterviewSchema = new Schema(
  {
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // student who scheduled the slot
    partner: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // student who joined it

    domain: {
      type: String,
      enum: ['DSA', 'System Design', 'HR/Behavioral', 'OS', 'DBMS', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'SQL', 'General'],
      required: true,
    },
    company: { type: Schema.Types.ObjectId, ref: 'Company' }, // optional: company-focused session

    scheduledFor: { type: Date, required: true },
    durationMinutes: { type: Number, default: 30 },
    // meetingProvider added alongside the existing meetingLink field (not a
    // rename) so a session can be tagged with which provider the pasted
    // link belongs to, driving URL validation and the "Opening Google
    // Meet..." / "Opening Zoom..." messaging on Join.
    meetingProvider: { type: String, enum: ['google-meet', 'zoom', 'custom'], default: 'custom' },
    meetingLink: { type: String, default: '' }, // e.g. a Google Meet/Zoom link the host pastes in

    status: { type: String, enum: ['open', 'matched', 'completed', 'cancelled'], default: 'open' },

    // Feedback each side leaves ABOUT the other person after the session
    feedbackForPartner: peerFeedbackSchema, // left by host, about partner
    feedbackForHost: peerFeedbackSchema, // left by partner, about host

    completedAt: { type: Date },
  },
  { timestamps: true }
);

peerMockInterviewSchema.index({ status: 1, scheduledFor: 1 });
peerMockInterviewSchema.index({ host: 1 });
peerMockInterviewSchema.index({ partner: 1 });

module.exports = mongoose.model('PeerMockInterview', peerMockInterviewSchema);
