// src/routes/exports.js
const express = require('express');
const router = express.Router();
const ExportService = require('../services/ExportService');
const jobQueue = require('../queues/jobQueue');
const { checkCreditsAvailable, handleCreditTransaction } = require('../services/creditService');

// Middleware to validate export request
const validateExportRequest = (req, res, next) => {
    const { userId, uploadedFileId, selected_templates } = req.body;

    if (!userId) {
        return res.status(400).json({
            error: 'User ID is required'
        });
    }

    if (!uploadedFileId) {
        return res.status(400).json({
            error: 'File ID is required'
        });
    }

    if (!Array.isArray(selected_templates) || selected_templates.length === 0) {
        return res.status(400).json({
            error: 'Selected templates are required'
        });
    }

    next();
};

// POST /api/exports/create
router.post('/create', validateExportRequest, async (req, res) => {
    try {
        const { 
            userId, 
            uploadedFileId, 
            selected_templates, 
            startRow = 0, 
            maxRows = null 
        } = req.body;

        // Get the total number of rows that will be processed
        const { data: fileData, error: fileError } = await ExportService.supabase
            .from('file_uploads')
            .select('data')
            .eq('id', uploadedFileId)
            .single();

        if (fileError || !fileData?.data) {
            throw new Error('No file data found');
        }

        const totalRowsToProcess = maxRows || (fileData.data.length - startRow);

        // Check if user has enough credits
        const hasEnoughCredits = await checkCreditsAvailable(userId, totalRowsToProcess);
        
        if (!hasEnoughCredits) {
            return res.json({
                message: `Insufficient credits. Required: ${totalRowsToProcess} credits`
            });
        }

        // Create a job to process and export all data:
        const job = await jobQueue.add('processExport', { 
            userId, 
            uploadedFileId, 
            selected_templates, 
            startRow, 
            maxRows 
        });

        res.json({ 
            message: 'Export process initiated successfully',
            data: { jobId: job?.id }
        });
    } catch (error) {
        console.error('Export creation error:', error);
        res.status(500).json({
            error: error.message || 'Failed to create export'
        });
    }
});

// GET /api/exports/:id/status
router.get('/:id/status', async (req, res) => {
    try {
        const { data: exportJob } = await ExportService.supabase
            .from('export_jobs')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (!exportJob) {
            return res.status(404).json({
                error: 'Export job not found'
            });
        }

        res.json({ data: exportJob });
    } catch (error) {
        console.error('Export status error:', error);
        res.status(500).json({
            error: error.message || 'Failed to fetch export status'
        });
    }
});

module.exports = router;