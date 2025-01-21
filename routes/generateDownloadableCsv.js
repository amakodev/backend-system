const { stringify } = require('csv-stringify');
const supabase = require('../utils/supabase');

const generateDownloadableCsv = async (fileId) => {
    try {
        const { data: records, error } = await supabase
            .from('processed_records')
            .select('record, result')
            .eq('file_id', fileId);

        if (error) throw error;

        return new Promise((resolve, reject) => {
            stringify(
                records.map(({ record, result }) => ({ ...record, result: JSON.stringify(result) })),
                { header: true },
                (err, csvString) => {
                    if (err) return reject(err);
                    resolve(csvString);
                }
            );
        });
    } catch (csvError) {
        console.error('Error generating downloadable CSV:', csvError.message);
        throw csvError;
    }
};

module.exports = { generateDownloadableCsv };
