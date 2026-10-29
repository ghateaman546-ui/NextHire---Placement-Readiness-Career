const mongoose = require('mongoose');
const { Schema } = mongoose;

const resumeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['builder'], default: 'builder', required: true },

    templateId: { type: String, default: 'classic' },
    sections: {
      summary: { type: String, default: '' },
      education: [{ institution: String, degree: String, year: String, cgpa: String }],
      experience: [{ company: String, role: String, duration: String, description: String }],
      projects: [{ title: String, description: String, techStack: [String], link: String }],
      skills: [{ type: String }],
      certifications: [{ title: String, issuer: String, year: String }],
      achievements: [{ type: String }],
    },
    sectionOrder: {
      type: [String],
      default: ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements'],
    },
    pdfUrl: { type: String, default: '' },

    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true }
);

resumeSchema.index({ userId: 1 });

module.exports = mongoose.model('Resume', resumeSchema);
