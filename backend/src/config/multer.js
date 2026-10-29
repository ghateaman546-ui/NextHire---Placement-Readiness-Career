const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilterImages = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const uploadImage = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: fileFilterImages });

module.exports = { uploadImage };
