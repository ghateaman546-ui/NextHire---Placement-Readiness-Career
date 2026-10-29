const mongoose = require('mongoose');
const { Schema } = mongoose;

const quizResultSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    answers: [
      {
        questionId: { type: Schema.Types.ObjectId, required: true },
        selectedOptionIndex: { type: Number },
        isCorrect: { type: Boolean },
      },
    ],
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    correctCount: { type: Number, required: true },
    incorrectCount: { type: Number, required: true },
    skippedCount: { type: Number, default: 0 },
    timeTakenSeconds: { type: Number },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

quizResultSchema.index({ userId: 1, quizId: 1 });
quizResultSchema.index({ quizId: 1, score: -1 });

module.exports = mongoose.model('QuizResult', quizResultSchema);
