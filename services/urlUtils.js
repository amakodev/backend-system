 const formatUrl = (inputUrl) => {
  let processedUrl = inputUrl.trim().toLowerCase();
  processedUrl = processedUrl.replace(/^www\./i, '');
  if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
    processedUrl = `https://${processedUrl}`;
  }
  return processedUrl;
};

module.exports = { formatUrl };