const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },

    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    isBlocked: { type: Boolean, default: false },

    photoUrl: { type: String, default: '' },
    college: { type: String, default: '' },
    branch: { type: String, default: '' },
    year: { type: Number, min: 1, max: 5 },
    cgpa: { type: Number, min: 0, max: 10 },
    skills: [{ type: String }],
    programmingLanguages: [{ type: String }],
    projects: [{ title: String, description: String, link: String, techStack: [String] }],
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
    resumeUrl: { type: String, default: '' },

    profileCompletionPercent: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    coursesCompleted: { type: Number, default: 0 },
    questionsSolved: { type: Number, default: 0 },
    resumeScore: { type: Number, default: 0 },
    mockInterviewAvgScore: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },

    lastActiveDate: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });
userSchema.index({ totalPoints: -1 });

module.exports = mongoose.model('User', userSchema);
