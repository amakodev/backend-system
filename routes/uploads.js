const express = require('express');
const multer = require('multer');
const supabase = require('../utils/supabase');
const router = express.Router();

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// File upload endpoint
router.post('/', upload.single('file'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const bucketName = 'file-uploads';
    const fileName = `${Date.now()}-${file.originalname}`;

    try {
        // Upload file to Supabase storage
        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true, // Replace if file exists
            });

        if (error) throw error;

        // Generate public URL
        const { publicURL, error: urlError } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);

        if (urlError) throw urlError;

        res.json({ fileUrl: publicURL });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error uploading file' });
    }
});

module.exports = router;
