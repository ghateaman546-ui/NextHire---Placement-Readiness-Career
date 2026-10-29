const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { uploadImage } = require('../config/multer');
const c = require('../controllers/company.controller');

router.get('/', c.listCompanies);
router.get('/admin/all', protect, requireRole('admin'), c.listCompaniesAdmin);
router.get('/:slug', c.getCompanyBySlug);
router.post('/', protect, requireRole('admin'), uploadImage.single('logo'), c.createCompany);
router.put('/:id', protect, requireRole('admin'), c.updateCompany);
router.delete('/:id', protect, requireRole('admin'), c.deleteCompany);
router.post('/:id/interview-experience', protect, c.addInterviewExperience);
router.post('/:id/previous-year-questions', protect, requireRole('admin'), c.addPreviousYearQuestion);

module.exports = router;
