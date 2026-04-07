// ============================================
// TalentScan AI - Main Application Logic
// ============================================

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadedFiles = document.getElementById('uploadedFiles');
const filesList = document.getElementById('filesList');
const fileCount = document.getElementById('fileCount');
const uploadedFilesHeader = document.getElementById('uploadedFilesHeader');
const collapseToggle = document.getElementById('collapseToggle');
const filesListContainer = document.getElementById('filesListContainer');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');
const resultsTableBody = document.getElementById('resultsTableBody');
const resultsCount = document.getElementById('resultsCount');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');

// Application State
let uploadedFilesData = [];
let analysisResults = [];
let fileToCandidateMap = new Map(); // Maps file names to candidate data

// ============================================
// File Upload Handling
// ============================================

// Click to upload
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// File input change
fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Drag and drop handlers
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

// Handle uploaded files
function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => {
        const extension = file.name.split('.').pop().toLowerCase();
        return ['pdf', 'doc', 'docx', 'txt', 'rtf', 'jpg', 'jpeg', 'png'].includes(extension);
    });

    if (validFiles.length === 0) {
        alert('Please upload only PDF, DOC, DOCX, TXT, RTF, or Image files (JPG, PNG).');
        return;
    }

    validFiles.forEach(file => {
        // Check for duplicates by name and size
        const isDuplicate = uploadedFilesData.some(
            f => f.name === file.name && f.size === file.size
        );
        
        if (!isDuplicate) {
            uploadedFilesData.push(file);
        }
    });

    displayUploadedFiles();
    
    // Start analysis process
    if (uploadedFilesData.length > 0) {
        startAnalysis();
    }
}

// Display uploaded files list
function displayUploadedFiles() {
    if (uploadedFilesData.length === 0) {
        uploadedFiles.style.display = 'none';
        return;
    }

    uploadedFiles.style.display = 'block';
    fileCount.textContent = `(${uploadedFilesData.length} file${uploadedFilesData.length > 1 ? 's' : ''})`;
    // CSP-compliant: Clear list using removeChild instead of innerHTML
    while (filesList.firstChild) {
        filesList.removeChild(filesList.firstChild);
    }

    uploadedFilesData.forEach((file, index) => {
        const li = document.createElement('li');
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileName = document.createElement('span');
        fileName.className = 'file-name';
        fileName.textContent = file.name;

        const fileSize = document.createElement('span');
        fileSize.className = 'file-size';
        fileSize.textContent = formatFileSize(file.size);

        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileSize);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×'; // CSP-compliant: using textContent instead of innerHTML
        removeBtn.title = 'Remove file';
        removeBtn.onclick = () => removeFile(index);

        li.appendChild(fileInfo);
        li.appendChild(removeBtn);
        filesList.appendChild(li);
    });
    
    // Ensure collapsed by default
    collapseFilesList();
}

// Toggle files list collapse/expand
function toggleFilesList() {
    filesListContainer.classList.toggle('expanded');
    collapseToggle.classList.toggle('expanded');
}

// Collapse files list
function collapseFilesList() {
    filesListContainer.classList.remove('expanded');
    collapseToggle.classList.remove('expanded');
}

// Expand files list
function expandFilesList() {
    filesListContainer.classList.add('expanded');
    collapseToggle.classList.add('expanded');
}

// Remove file from list
function removeFile(index) {
    uploadedFilesData.splice(index, 1);
    displayUploadedFiles();
    
    // If no files left, hide results
    if (uploadedFilesData.length === 0) {
        resultsSection.style.display = 'none';
        analysisResults = [];
        fileToCandidateMap.clear();
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ============================================
// Analysis Process
// ============================================

async function startAnalysis() {
    // Show loading indicator
    loadingSection.style.display = 'block';
    resultsSection.style.display = 'none';
    
    // Update loading message
    const loadingText = loadingSection.querySelector('p');
    
    // Scroll to loading section
    loadingSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Reset results
    analysisResults = [];
    fileToCandidateMap.clear();
    
    // Track if we've hit quota exhaustion
    let quotaExhausted = false;
    
    // Process each file with delays to respect rate limits
    for (let i = 0; i < uploadedFilesData.length; i++) {
        const file = uploadedFilesData[i];
        
        // Update progress
        if (loadingText) {
            if (quotaExhausted) {
                loadingText.textContent = `Using fallback analysis for CV ${i + 1} of ${uploadedFilesData.length} (API quota exhausted)...`;
            } else {
                loadingText.textContent = `Analyzing CV ${i + 1} of ${uploadedFilesData.length}...`;
            }
        }
        
        try {
            // Call Gemini API to analyze CV with retry logic
            const result = await analyzeCVWithRetry(file, i + 1, uploadedFilesData.length);
            
            // Check if result came from fallback (quota exhausted)
            if (result.isFallback) {
                quotaExhausted = true;
            }
            
            // Store result with file reference
            result.file = file;
            analysisResults.push(result);
            fileToCandidateMap.set(file.name, result);
            
            // Add delay between requests to avoid rate limits (2 seconds between files)
            // Skip delay if quota is exhausted (using fallback)
            if (i < uploadedFilesData.length - 1 && !quotaExhausted) {
                await sleep(2000);
            }
            
        } catch (error) {
            console.error(`Error analyzing ${file.name}:`, error);
            // Create error result
            const errorResult = {
                name: file.name.replace(/\.[^/.]+$/, ''),
                applyingRole: 'Not specified',
                skillMatch: 0,
                redFlags: [`Analysis failed: ${error.message}`],
                file: file
            };
            analysisResults.push(errorResult);
            fileToCandidateMap.set(file.name, errorResult);
        }
    }
    
    // Show notification if quota was exhausted
    if (quotaExhausted) {
        console.warn('API quota exhausted. Results shown are based on fallback analysis.');
    }
    
    // Sort by skillMatch (descending) - higher skill match = better rank
    analysisResults.sort((a, b) => b.skillMatch - a.skillMatch);
    
    // Assign ranks based on sorted order (1 = best, 2 = second best, etc.)
    analysisResults.forEach((result, index) => {
        result.rank = index + 1;
    });
    
    // Hide loading, show results
    loadingSection.style.display = 'none';
    displayResults();
}

// Helper function to sleep/delay
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Gemini API Integration
// ============================================

/**
 * Analyzes a CV file using Google Gemini API with retry logic
 * @param {File} file - The CV file to analyze
 * @param {number} currentIndex - Current file index (for progress)
 * @param {number} totalFiles - Total number of files (for progress)
 * @param {number} retryCount - Current retry attempt
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<Object>} Analysis result with name, skillMatch, redFlags
 */
async function analyzeCVWithRetry(file, currentIndex = 1, totalFiles = 1, retryCount = 0, maxRetries = 3) {
    try {
        return await analyzeCV(file);
    } catch (error) {
        // Check if it's a rate limit error (429)
        if (error.status === 429 || error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('quota')) {
            // Extract retry delay from error if available
            let retryDelay = 30000; // Default 30 seconds
            
            // Try to get retry delay from error object first
            if (error.retryDelay) {
                // Convert from seconds to milliseconds if needed
                if (typeof error.retryDelay === 'string') {
                    // Handle string format like "32.676533228s" or "32s"
                    retryDelay = parseFloat(error.retryDelay.replace(/s$/i, '')) * 1000;
                } else {
                    retryDelay = error.retryDelay * 1000;
                }
                retryDelay = Math.ceil(retryDelay) + 3000; // Add 3 seconds buffer
            } else {
                // Try to extract from error message (handles "Please retry in 32.676533228s")
                try {
                    const errorMatch = error.message.match(/retry in ([\d.]+)s/i);
                    if (errorMatch) {
                        retryDelay = Math.ceil(parseFloat(errorMatch[1]) * 1000) + 3000; // Add 3 seconds buffer
                    }
                } catch (e) {
                    // Use default delay
                }
            }
            
            // Check if quota is completely exhausted (limit: 0)
            const isQuotaExhausted = error.message.includes('limit: 0') || 
                                     error.message.includes('Quota exceeded for metric') ||
                                     (error.errorData && error.errorData.error && 
                                      error.errorData.error.details && 
                                      error.errorData.error.details.some(d => 
                                          d.violations && d.violations.some(v => 
                                              v.quotaMetric && v.quotaMetric.includes('free_tier') && 
                                              (v.quotaLimit === '0' || v.quotaLimit === 0)
                                          )
                                      ));
            
            if (isQuotaExhausted && retryCount < maxRetries) {
                // If quota is hit, wait and retry instead of immediate fallback
                const loadingText = loadingSection.querySelector('p');
                const waitSeconds = Math.ceil(retryDelay / 1000);
                if (loadingText) {
                    loadingText.textContent = `API Quota limit hit. Resuming analysis in ${waitSeconds}s... (${retryCount + 1}/${maxRetries})`;
                }
                
                console.log(`Quota hit for ${file.name}. Waiting ${retryDelay}ms before retry...`);
                await sleep(retryDelay);
                return analyzeCVWithRetry(file, currentIndex, totalFiles, retryCount + 1, maxRetries);
            }
            
            // If we haven't exceeded max retries, wait and retry
            if (retryCount < maxRetries) {
                const loadingText = loadingSection.querySelector('p');
                if (loadingText) {
                    const waitSeconds = Math.ceil(retryDelay / 1000);
                    loadingText.textContent = `Rate limit reached. Waiting ${waitSeconds}s before retrying (${retryCount + 1}/${maxRetries})...`;
                }
                
                console.log(`Rate limit hit for ${file.name}. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                await sleep(retryDelay);
                
                // Retry with exponential backoff
                return analyzeCVWithRetry(file, currentIndex, totalFiles, retryCount + 1, maxRetries);
            } else {
                // After max retries, throw the error instead of fallback
                throw new Error(`Maximum retries exceeded. API is currently overloaded. Please try again in 1-2 minutes.`);
            }
        }
        
        // For other errors, throw immediately
        throw error;
    }
}

/**
 * Fixes common incomplete JSON issues
 * @param {string} jsonText - Potentially incomplete JSON string
 * @returns {string} Fixed JSON string
 */
function fixIncompleteJSON(jsonText) {
    let fixed = jsonText.trim();
    
    // Remove any trailing commas before closing braces/brackets
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Handle incomplete redFlags - if "redFlags": is not followed by [ or {, add empty array
    const redFlagsIndex = fixed.indexOf('"redFlags"');
    if (redFlagsIndex !== -1) {
        const afterRedFlags = fixed.substring(redFlagsIndex);
        const colonIndex = afterRedFlags.indexOf(':');
        if (colonIndex !== -1) {
            const afterColon = afterRedFlags.substring(colonIndex + 1).trim();
            // If no array or object after colon, add empty array
            if (!afterColon.startsWith('[') && !afterColon.startsWith('{')) {
                // Find where to insert the array (before next } or end of string)
                const nextBrace = fixed.indexOf('}', redFlagsIndex);
                if (nextBrace !== -1) {
                    // Insert [] before the closing brace
                    fixed = fixed.substring(0, nextBrace).trim() + ' []' + fixed.substring(nextBrace);
                } else {
                    // No closing brace, add [] and }
                    fixed = fixed.trim() + ' []}';
                }
            } else if (afterColon.startsWith('[')) {
                // Array exists, check if it's closed
                const arrayStart = fixed.indexOf('[', redFlagsIndex);
                if (arrayStart !== -1) {
                    const afterArray = fixed.substring(arrayStart + 1);
                    const closingBracket = afterArray.indexOf(']');
                    const closingBrace = afterArray.indexOf('}');
                    
                    // If no closing bracket or it comes after closing brace
                    if (closingBracket === -1 || (closingBrace !== -1 && closingBracket > closingBrace)) {
                        // Insert closing bracket before closing brace
                        const bracePos = fixed.indexOf('}', arrayStart);
                        if (bracePos !== -1) {
                            fixed = fixed.substring(0, bracePos) + ']' + fixed.substring(bracePos);
                        }
                    }
                }
            }
        }
    }
    
    // Ensure proper closing braces
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
        fixed = fixed + '}'.repeat(openBraces - closeBraces);
    }
    
    // Ensure proper closing brackets
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
        fixed = fixed + ']'.repeat(openBrackets - closeBrackets);
    }
    
    return fixed;
}

/**
 * Extracts partial data from incomplete JSON
 * @param {string} jsonText - Incomplete JSON string
 * @returns {Object} Partial analysis result
 */
function extractPartialJSON(jsonText) {
    const result = {
        name: null,
        applyingRole: null,
        skillMatch: 0,
        redFlags: []
    };
    
    // Try to extract name (handle escaped quotes)
    const nameMatch = jsonText.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (nameMatch && nameMatch[1]) {
        result.name = nameMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    
    // Try to extract applyingRole (handle escaped quotes)
    const applyingRoleMatch = jsonText.match(/"applyingRole"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (applyingRoleMatch && applyingRoleMatch[1]) {
        result.applyingRole = applyingRoleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    
    // Try to extract skillMatch (handle numbers)
    const skillMatchMatch = jsonText.match(/"skillMatch"\s*:\s*(\d+)/);
    if (skillMatchMatch && skillMatchMatch[1]) {
        result.skillMatch = Math.max(0, Math.min(100, parseInt(skillMatchMatch[1]) || 0));
    }
    
    // Try to extract redFlags array
    // First try to find complete array
    const redFlagsCompleteMatch = jsonText.match(/"redFlags"\s*:\s*\[([^\]]*)\]/s);
    if (redFlagsCompleteMatch) {
        try {
            const flagsText = '[' + redFlagsCompleteMatch[1] + ']';
            result.redFlags = JSON.parse(flagsText);
        } catch (e) {
            // Extract individual flag strings
            const flagsContent = redFlagsCompleteMatch[1];
            const flagRegex = /"((?:[^"\\]|\\.)*)"/g;
            let flagMatch;
            while ((flagMatch = flagRegex.exec(flagsContent)) !== null) {
                result.redFlags.push(flagMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
            }
        }
    } else {
        // Try to find incomplete array (no closing bracket)
        const redFlagsIncompleteMatch = jsonText.match(/"redFlags"\s*:\s*\[([^\]]*)/s);
        if (redFlagsIncompleteMatch) {
            const flagsContent = redFlagsIncompleteMatch[1];
            const flagRegex = /"((?:[^"\\]|\\.)*)"/g;
            let flagMatch;
            while ((flagMatch = flagRegex.exec(flagsContent)) !== null) {
                result.redFlags.push(flagMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
            }
        }
        // If redFlags field exists but has no value, leave as empty array (already set)
    }
    
    return result;
}

/**
 * Analyzes a CV file using Google Gemini API
 * @param {File} file - The CV file to analyze
 * @returns {Promise<Object>} Analysis result with name, skillMatch, redFlags
 */
async function analyzeCV(file) {
    const apiKey = 'AIzaSyBr7vb2gm25zRQGgL0Jw6QhyJ-BeMu2yZk';
    // Using gemini-2.0-flash-exp (gemini-2.5-flash may not be available yet)
    // If you have access to gemini-2.5-flash, change the model name below
    const model = 'gemini-2.5-flash-lite';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    try {
        // Convert file to base64
        const base64 = await fileToBase64(file);
        
        // Determine MIME type based on file extension
        const fileExtension = file.name.split('.').pop().toLowerCase();
        let mimeType = file.type;
        
        if (!mimeType || mimeType === 'application/octet-stream') {
            const mimeTypes = {
                'pdf': 'application/pdf',
                'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'txt': 'text/plain',
                'rtf': 'application/rtf',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png'
            };
            mimeType = mimeTypes[fileExtension] || 'application/pdf';
        }
        
        // Extract base64 data (remove data:type;base64, prefix)
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        
        // Create the prompt for Gemini
        const prompt = `You are an expert HR recruitment specialist and CV analyst. 
Analyze this CV/resume document thoroughly. Even if it's an image, use OCR to extract every detail.
Focus on career progression, leadership roles, and high-impact company experience (e.g., Mailchimp, InVision, WHO).
Extract the following information and return ONLY a valid JSON object:

{
  "name": "Candidate's full name",
  "applyingRole": "The candidate's primary or current role",
  "skillMatch": 95,
  "highlights": ["Senior Leader", "Mailchimp experience", "Top-tier education"],
  "redFlags": []
}

Guidelines:
- "skillMatch": Provide a score from 0-100. 
    * 85-100%: Elite experts at world-class companies.
    * 60-84%: Solid, consistent profiles.
    * BELOW 30%: ZERO TOLERANCE - If you find ANY logical contradictions (e.g., conflicting years of experience, fake-sounding claims, or impossible timelines), the score MUST be below 30%.
- "highlights": Extract 2-3 top strengths. Max 10 words.
- "redFlags": List concerns EXTREMELY CONCISELY (MAX 10 words per point). 

CRITICAL: Return ONLY the JSON object. No markdown. No intro/outro text.`;

        console.log(`Starting API request for ${file.name} using ${model}...`);

        // Prepare the request
        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.3,
                topK: 32,
                topP: 1,
                maxOutputTokens: 1024,
                responseMimeType: "application/json"
            }
        };
        
        // Call Gemini API
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Handle rate limit errors specifically
            if (response.status === 429) {
                let errorMessage = 'Rate limit exceeded';
                let retryDelay = null;
                
                if (errorData.error) {
                    errorMessage = errorData.error.message || errorMessage;
                    
                    // Extract retry delay from error details
                    if (errorData.error.details) {
                        const retryInfo = errorData.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                        if (retryInfo && retryInfo.retryDelay) {
                            retryDelay = retryInfo.retryDelay;
                        }
                    }
                }
                
                const error = new Error(`Gemini API error: ${response.status} ${response.statusText}. ${errorMessage}`);
                error.status = 429;
                error.retryDelay = retryDelay;
                error.errorData = errorData;
                error.message = errorMessage; // Store full error message for retry delay extraction
                throw error;
            }
            
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        console.log('Gemini API success response:', data);
        
        // Extract the response text
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
            console.error('Gemini API Error details:', data);
            throw new Error('Invalid response format from Gemini API');
        }
        
        const responseText = data.candidates[0].content.parts[0].text;
        console.log('Raw AI Response:', responseText);
        
        // Parse JSON response safely
        let analysisResult;
        try {
            // Clean the response text (remove markdown code blocks if present)
            let cleanedText = responseText.trim();
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/```\n?/g, '');
            }
            
            // Try to fix incomplete JSON (common issues with Gemini responses)
            cleanedText = fixIncompleteJSON(cleanedText);
            
            // Use safe JSON parsing (CSP-compliant - no eval used)
            // JSON.parse is native JavaScript and doesn't use eval()
            analysisResult = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('Failed to parse Gemini response:', responseText);
            console.error('Parse error:', parseError);
            
            // Try to extract partial data from incomplete JSON
            try {
                analysisResult = extractPartialJSON(responseText);
                console.warn('Using partial JSON extraction for:', file.name);
            } catch (extractError) {
                throw new Error(`Failed to parse Gemini response: ${parseError.message}`);
            }
        }
        
            // Validate and normalize the response
        const result = {
            name: (analysisResult.name && analysisResult.name.trim()) || file.name.replace(/\.[^/.]+$/, ''),
            applyingRole: (analysisResult.applyingRole && analysisResult.applyingRole.trim()) || 'Not specified',
            skillMatch: Math.max(0, Math.min(100, parseInt(analysisResult.skillMatch) || 0)),
            highlights: Array.isArray(analysisResult.highlights) ? analysisResult.highlights : [],
            redFlags: Array.isArray(analysisResult.redFlags) ? analysisResult.redFlags : []
        };
        
        // Ensure skillMatch is a valid number
        if (isNaN(result.skillMatch)) {
            result.skillMatch = 0;
        }
        
        // Clean up name (remove extra whitespace, handle "NAME AND SURNAME" format)
        if (result.name) {
            result.name = result.name.trim().replace(/\s+/g, ' ');
            // If name is all caps like "NAME AND SURNAME", convert to title case
            if (result.name === result.name.toUpperCase() && result.name.length > 3) {
                result.name = result.name.split(' ').map(word => 
                    word.charAt(0) + word.slice(1).toLowerCase()
                ).join(' ');
            }
        }
        
        return result;
        
    } catch (error) {
        // Rethrow rate limit or connection errors so the retry mechanism can handle them
        if (error.status === 429 || error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
            throw error;
        }
        
        console.error(`Error analyzing CV ${file.name}:`, error);
        
        // Return fallback formatted object for other non-retriable errors
        return {
            name: file.name.replace(/\.[^/.]+$/, ''),
            applyingRole: 'Not specified',
            skillMatch: 0,
            highlights: [],
            redFlags: [`Analysis error: ${error.message}`]
        };
    }
}

/**
 * Helper function to convert file to base64
 * @param {File} file - File to convert
 * @returns {Promise<string>} Base64 string
 */
async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

/**
 * Generate dummy analysis data for testing
 * @param {File} file - File to generate dummy data for
 * @returns {Object} Dummy analysis result
 */
function generateDummyAnalysis(file) {
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const names = fileName.split(/[-_\s]/).filter(n => n.length > 0);
    const candidateName = names.length > 0 
        ? names.map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(' ')
        : fileName;
    
    // Generate random but realistic data
    // Skill match will determine rank (higher = better rank)
    const skillMatch = Math.floor(Math.random() * 30) + 70; // 70-100%
    // Rank will be assigned after sorting by skillMatch, so don't set it here
    
    const bestFitOptions = [
        { value: 'Yes', type: 'yes' },
        { value: 'No', type: 'no' },
        { value: `${Math.floor(Math.random() * 30) + 70}/100`, type: 'score' }
    ];
    const bestFit = bestFitOptions[Math.floor(Math.random() * bestFitOptions.length)];
    
    const redFlagsOptions = [
        [],
        ['Employment gap'],
        ['Frequent job changes'],
        ['Missing certifications'],
        ['Employment gap', 'Limited experience'],
        ['Overqualified'],
        ['Long employment gap', 'Frequent job changes']
    ];
    const redFlags = redFlagsOptions[Math.floor(Math.random() * redFlagsOptions.length)];
    
    // Generate applying role options
    const applyingRoles = [
        'Software Engineer',
        'Senior Software Engineer',
        'Full Stack Developer',
        'Frontend Developer',
        'Backend Developer',
        'DevOps Engineer',
        'Data Scientist',
        'Product Manager',
        'UI/UX Designer',
        'Project Manager'
    ];
    const applyingRole = applyingRoles[Math.floor(Math.random() * applyingRoles.length)];
    
    return {
        name: candidateName,
        applyingRole: applyingRole,
        // rank will be assigned after sorting by skillMatch
        bestFit: bestFit.value,
        bestFitType: bestFit.type,
        skillMatch: skillMatch,
        redFlags: redFlags
    };
}

// ============================================
// Results Display
// ============================================

function displayResults() {
    if (analysisResults.length === 0) {
        resultsSection.style.display = 'none';
        return;
    }
    
    resultsSection.style.display = 'block';
    resultsCount.textContent = `${analysisResults.length} Candidate${analysisResults.length > 1 ? 's' : ''} Analyzed`;
    // CSP-compliant: Clear table body using removeChild instead of innerHTML
    while (resultsTableBody.firstChild) {
        resultsTableBody.removeChild(resultsTableBody.firstChild);
    }
    
    analysisResults.forEach((candidate, index) => {
        const row = createResultRow(candidate, index);
        resultsTableBody.appendChild(row);
    });
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function createResultRow(candidate, index) {
    const row = document.createElement('tr');
    row.style.animationDelay = `${index * 0.1}s`;
    
    // Candidate Name
    const nameCell = document.createElement('td');
    nameCell.className = 'candidate-name';
    const nameContainer = document.createElement('div');
    nameContainer.style.display = 'flex';
    nameContainer.style.alignItems = 'center';
    nameContainer.style.gap = '8px';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = candidate.name;
    nameContainer.appendChild(nameSpan);
    
    nameCell.appendChild(nameContainer);
    row.appendChild(nameCell);
    
    // Rank
    const rankCell = document.createElement('td');
    const rankBadge = document.createElement('span');
    const rankClass = candidate.rank <= 3 ? `rank-${candidate.rank}` : 'rank-other';
    rankBadge.className = `ai-rank ${rankClass}`;
    rankBadge.textContent = `#${candidate.rank}`;
    rankCell.appendChild(rankBadge);
    row.appendChild(rankCell);
    
    // Applying Role
    const applyingRoleCell = document.createElement('td');
    applyingRoleCell.className = 'applying-role';
    applyingRoleCell.textContent = candidate.applyingRole || 'Not specified';
    row.appendChild(applyingRoleCell);
    
    // Skill Match %
    const skillMatchCell = document.createElement('td');
    const skillMatchSpan = document.createElement('span');
    let matchClass = 'match-low';
    if (candidate.skillMatch >= 85) {
        matchClass = 'match-high';
    } else if (candidate.skillMatch >= 70) {
        matchClass = 'match-medium';
    }
    skillMatchSpan.className = `skill-match ${matchClass}`;
    skillMatchSpan.textContent = `${candidate.skillMatch}%`;
    skillMatchCell.appendChild(skillMatchSpan);
    row.appendChild(skillMatchCell);
    
    // Highlights (Positive Tags)
    const highlightsCell = document.createElement('td');
    const highlightsDiv = document.createElement('div');
    highlightsDiv.className = 'highlights-container';
    
    if (candidate.highlights && candidate.highlights.length > 0) {
        candidate.highlights.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'highlight-tag';
            tagSpan.textContent = tag;
            highlightsDiv.appendChild(tagSpan);
        });
    } else {
        highlightsDiv.textContent = 'None';
        highlightsDiv.className = 'no-highlights';
    }
    highlightsCell.appendChild(highlightsDiv);
    row.appendChild(highlightsCell);

    // Red Flags
    const redFlagsCell = document.createElement('td');
    const redFlagsDiv = document.createElement('div');
    redFlagsDiv.className = 'red-flags';
    
    if (candidate.redFlags.length === 0) {
        redFlagsDiv.textContent = 'None';
        redFlagsDiv.className = 'no-flags';
    } else {
        candidate.redFlags.forEach(flag => {
            const flagSpan = document.createElement('span');
            flagSpan.className = 'flag';
            flagSpan.textContent = flag;
            redFlagsDiv.appendChild(flagSpan);
        });
    }
    
    redFlagsCell.appendChild(redFlagsDiv);
    row.appendChild(redFlagsCell);
    
    // Actions
    const actionsCell = document.createElement('td');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'action-buttons';
    
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-view';
    viewBtn.textContent = 'View CV';
    viewBtn.onclick = () => viewCV(candidate);
    
    actionsDiv.appendChild(viewBtn);
    actionsCell.appendChild(actionsDiv);
    row.appendChild(actionsCell);
    
    return row;
}

// ============================================
// CV View
// ============================================

function viewCV(candidate) {
    const file = candidate.file;
    if (!file) {
        alert('CV file not found');
        return;
    }
    
    modalTitle.textContent = `${candidate.name} - CV Preview`;
    while (modalBody.firstChild) {
        modalBody.removeChild(modalBody.firstChild);
    }
    
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const fileUrl = URL.createObjectURL(file);
    
    // Add cleanup listener for object URL
    const cleanup = () => {
        URL.revokeObjectURL(fileUrl);
        modalClose.removeEventListener('click', cleanup);
        modalOverlay.removeEventListener('click', cleanupOutside);
    };
    const cleanupOutside = (e) => {
        if (e.target === modalOverlay) cleanup();
    };
    modalClose.addEventListener('click', cleanup);
    modalOverlay.addEventListener('click', cleanupOutside);
    
    if (file.type === 'application/pdf' || fileExtension === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = fileUrl;
        modalBody.appendChild(iframe);
    } else if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png'].includes(fileExtension)) {
        const img = document.createElement('img');
        img.src = fileUrl;
        img.className = 'cv-image-preview';
        img.alt = `CV Preview for ${candidate.name}`;
        modalBody.appendChild(img);
    } else if (file.type === 'text/plain' || fileExtension === 'txt') {
        // Fetch and display text content
        const reader = new FileReader();
        reader.onload = (e) => {
            const pre = document.createElement('pre');
            pre.className = 'cv-text-preview';
            pre.textContent = e.target.result;
            modalBody.appendChild(pre);
        };
        reader.readAsText(file);
    } else {
        // For DOC/DOCX/RTF, show a professional placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-placeholder';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'placeholder-icon';
        iconDiv.textContent = '📄';
        
        const fileNamePara = document.createElement('p');
        fileNamePara.style.fontSize = '1.3rem';
        fileNamePara.style.fontWeight = '600';
        fileNamePara.style.color = 'var(--text-primary)';
        fileNamePara.style.marginBottom = '12px';
        fileNamePara.textContent = file.name;
        
        const messagePara = document.createElement('p');
        messagePara.textContent = 'Direct preview is not supported for this format.';
        messagePara.style.marginBottom = '24px';
        
        const downloadBtn = document.createElement('a');
        downloadBtn.href = fileUrl;
        downloadBtn.download = file.name;
        downloadBtn.className = 'btn btn-download';
        downloadBtn.textContent = 'Download to View';
        downloadBtn.style.padding = '12px 30px';
        
        placeholder.appendChild(iconDiv);
        placeholder.appendChild(fileNamePara);
        placeholder.appendChild(messagePara);
        placeholder.appendChild(downloadBtn);
        modalBody.appendChild(placeholder);
    }
    
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// ============================================
// Modal Handling
// ============================================

modalClose.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
        closeModal();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        closeModal();
    }
});

function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    // CSP-compliant: Clear modal body using removeChild instead of innerHTML
    while (modalBody.firstChild) {
        modalBody.removeChild(modalBody.firstChild);
    }
}

// ============================================
// Collapse/Expand Event Listeners
// ============================================

// Toggle on header click
if (uploadedFilesHeader) {
    uploadedFilesHeader.addEventListener('click', (e) => {
        // Don't toggle if clicking on the toggle button itself (it has its own handler)
        if (e.target.closest('.collapse-toggle')) return;
        toggleFilesList();
    });
}

// Toggle on button click
if (collapseToggle) {
    collapseToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFilesList();
    });
}

// ============================================
// Initialize App
// ============================================

// App is ready
console.log('TalentScan AI - Application Loaded');
console.log('Ready for Gemini API integration');

