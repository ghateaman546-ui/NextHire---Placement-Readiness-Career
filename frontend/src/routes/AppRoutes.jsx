import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import AdminLayout from '../components/layout/AdminLayout.jsx';

import Login from '../pages/auth/Login.jsx';
import AdminLogin from '../pages/auth/AdminLogin.jsx';
import Signup from '../pages/auth/Signup.jsx';
import ForgotPassword from '../pages/auth/ForgotPassword.jsx';
import ResetPassword from '../pages/auth/ResetPassword.jsx';

import Dashboard from '../pages/student/Dashboard.jsx';
import Profile from '../pages/student/Profile.jsx';
import DsaSheet from '../pages/student/DsaSheet.jsx';
import Aptitude from '../pages/student/Aptitude.jsx';
import TechnicalQuizzes from '../pages/student/TechnicalQuizzes.jsx';
import InterviewPrep from '../pages/student/InterviewPrep.jsx';
import ResumeBuilder from '../pages/student/ResumeBuilder.jsx';
import ATSAnalyzer from '../pages/student/ATSAnalyzer.jsx';
import MockInterview from '../pages/student/MockInterview.jsx';
import PeerMockInterview from '../pages/student/PeerMockInterview.jsx';
import Companies from '../pages/student/Companies.jsx';
import CompanyDetail from '../pages/student/CompanyDetail.jsx';
import Playground from '../pages/student/Playground.jsx';
import CodingProblems from '../pages/student/CodingProblems.jsx';
import CodingProblemDetail from '../pages/student/CodingProblemDetail.jsx';
import Leaderboard from '../pages/student/Leaderboard.jsx';
import Notes from '../pages/student/Notes.jsx';
import Feedback from '../pages/student/Feedback.jsx';

import AdminDashboard from '../pages/admin/AdminDashboard.jsx';
import ManageStudents from '../pages/admin/ManageStudents.jsx';
import StudentDetail from '../pages/admin/StudentDetail.jsx';
import ManageCompanies from '../pages/admin/ManageCompanies.jsx';
import ManageQuestions from '../pages/admin/ManageQuestions.jsx';
import ManageInterviewQuestions from '../pages/admin/ManageInterviewQuestions.jsx';
import ManageTopics from '../pages/admin/ManageTopics.jsx';
import ManageQuizzes from '../pages/admin/ManageQuizzes.jsx';
import QuizResults from '../pages/admin/QuizResults.jsx';
import ManageCodingProblems from '../pages/admin/ManageCodingProblems.jsx';
import ManageFeedback from '../pages/admin/ManageFeedback.jsx';
import ManageNotifications from '../pages/admin/ManageNotifications.jsx';

import NotFound from '../pages/NotFound.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/dsa" element={<DsaSheet />} />
          <Route path="/aptitude" element={<Aptitude />} />
          <Route path="/technical-quizzes" element={<TechnicalQuizzes />} />
          <Route path="/interview-prep" element={<InterviewPrep />} />
          <Route path="/resume-builder" element={<ResumeBuilder />} />
          <Route path="/ats-analyzer" element={<ATSAnalyzer />} />
          <Route path="/mock-interview" element={<MockInterview />} />
          <Route path="/peer-mock-interview" element={<PeerMockInterview />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/companies/:slug" element={<CompanyDetail />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/coding-problems" element={<CodingProblems />} />
          <Route path="/coding-problems/:slug" element={<CodingProblemDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/feedback" element={<Feedback />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="admin" />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/students" element={<ManageStudents />} />
          <Route path="/admin/students/:id" element={<StudentDetail />} />
          <Route path="/admin/companies" element={<ManageCompanies />} />
          <Route path="/admin/topics" element={<ManageTopics />} />
          <Route path="/admin/questions" element={<ManageQuestions />} />
          <Route path="/admin/interview-questions" element={<ManageInterviewQuestions />} />
          <Route path="/admin/quizzes" element={<ManageQuizzes />} />
          <Route path="/admin/quizzes/:id/results" element={<QuizResults />} />
          <Route path="/admin/coding-problems" element={<ManageCodingProblems />} />
          <Route path="/admin/feedback" element={<ManageFeedback />} />
          <Route path="/admin/notifications" element={<ManageNotifications />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
