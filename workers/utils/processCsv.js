const fs = require('fs');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');

async function processCsv(fileBuffer) {
    return new Promise((resolve, reject) => {
        const output = [];

        // Parse the CSV file
        parse(fileBuffer, { columns: true }, (err, records) => {
            if (err) return reject(err);

            // Edit records (example: add a new column)
            records.forEach((record) => {
                record.newColumn = 'Processed';
                output.push(record);
            });

            // Stringify the updated CSV
            stringify(output, { header: true }, (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
        });
    });
}

module.exports = processCsv;