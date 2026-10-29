const mongoose = require('mongoose');
const { Schema } = mongoose;

const leaderboardSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    totalPoints: { type: Number, default: 0 },
    weeklyPoints: { type: Number, default: 0 },
    monthlyPoints: { type: Number, default: 0 },
    weeklyRank: { type: Number },
    monthlyRank: { type: Number },
    allTimeRank: { type: Number },
    badges: [{ type: Schema.Types.ObjectId, ref: 'Badge' }],
    lastCalculatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

leaderboardSchema.index({ totalPoints: -1 });
leaderboardSchema.index({ weeklyPoints: -1 });
leaderboardSchema.index({ monthlyPoints: -1 });

module.exports = mongoose.model('Leaderboard', leaderboardSchema);
