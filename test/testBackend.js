const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data'); // Import form-data

// Base URL of your server
const BASE_URL = 'http://localhost:3000';

// Paths and test data
const TEST_FILE_PATH = path.resolve(__dirname, 'sample.csv'); // Replace with your test file path

// Helper function to log messages with colors
const log = (message, type = 'info') => {
    const colors = {
        info: '\x1b[36m%s\x1b[0m', // Cyan
        success: '\x1b[32m%s\x1b[0m', // Green
        error: '\x1b[31m%s\x1b[0m', // Red
    };
    console.log(colors[type] || colors.info, message);
};

// Upload a file to the backend
const testFileUpload = async () => {
    log('Testing file upload endpoint...', 'info');
    try {
        const formData = new FormData(); // Initialize FormData from form-data package
        formData.append('file', fs.createReadStream(TEST_FILE_PATH));

        const response = await axios.post(`${BASE_URL}/uploads`, formData, {
            headers: formData.getHeaders(), // Get the headers required for multipart/form-data
        });
        log(`File uploaded successfully: ${response.data.fileUrl}`, 'success');
        return response.data.fileUrl;
    } catch (error) {
        log(`File upload failed: ${error.message}`, 'error');
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
};

// Submit a job to the backend
const testJobSubmission = async (fileUrl) => {
    log('Testing job submission endpoint...', 'info');
    try {
        const response = await axios.post(`${BASE_URL}/jobs/processFile`, { fileUrl });

        log(`Job submitted successfully: ${response.data.jobId}`, 'success');
        return response.data.jobId;
    } catch (error) {
        log(`Job submission failed: ${error.message}`, 'error');
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
};

// Run all tests
const runTests = async () => {
    try {
        // Check if the test file exists
        if (!fs.existsSync(TEST_FILE_PATH)) {
            log(`Test file not found at ${TEST_FILE_PATH}. Please provide a valid file.`, 'error');
            return;
        }

        log('Starting full backend test...', 'info');

        // Test file upload
        const uploadedFileUrl = await testFileUpload();

        // Test job submission
        const jobId = await testJobSubmission(uploadedFileUrl);

        log('All tests completed successfully!', 'success');
        log(`Uploaded file URL: ${uploadedFileUrl}`);
        log(`Submitted job ID: ${jobId}`);
    } catch (error) {
        log('Test failed. See logs above for details.', 'error');
    }
};

// Execute the tests
runTests();
