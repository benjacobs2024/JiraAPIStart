require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Configure your Jira domain here or set JIRA_DOMAIN environment variable
const JIRA_DOMAIN = process.env.JIRA_DOMAIN || 'https://your-domain.atlassian.net';

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files (HTML)
app.use(express.static('.'));

// Server-side add comment endpoint
app.post('/add-comment', async (req, res) => {
    const { authHeader, issueKey, comment } = req.body;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    try {
        const response = await fetch(`https://mmn-service.atlassian.net/rest/api/3/issue/${issueKey}/comment`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                body: {
                    type: 'doc',
                    version: 1,
                    content: [{
                        type: 'paragraph',
                        content: [{
                            type: 'text',
                            text: comment
                        }]
                    }]
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            res.status(200).json(data);
        } else {
            const data = await response.text();
            res.status(response.status).json({ error: data });
        }
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Server-side attachment upload endpoint
app.post('/add-attachment', upload.single('file'), async (req, res) => {
    console.log('=== Add Attachment Request ===');
    console.log('Body:', req.body);
    console.log('File:', req.file);

    const { authHeader, issueKey } = req.body;

    if (!authHeader) {
        console.log('Error: No authHeader provided');
        return res.status(401).json({ error: 'Authorization required' });
    }

    if (!req.file) {
        console.log('Error: No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Create FormData with the file
        const FormData = require('form-data');
        const formData = new FormData();

        // Add the file as a stream
        formData.append('file', fs.createReadStream(req.file.path), {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        console.log('Uploading to Jira...');
        console.log('File:', req.file.originalname, 'Size:', req.file.size);

        // Use https module with form-data for proper multipart upload
        const uploadPromise = new Promise((resolve, reject) => {
            const options = {
                hostname: 'mmn-service.atlassian.net',
                path: `/rest/api/3/issue/${issueKey}/attachments`,
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                    'X-Atlassian-Token': 'no-check',
                    ...formData.getHeaders()
                }
            };

            const request = https.request(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    resolve({
                        status: response.statusCode,
                        data: data
                    });
                });
            });

            request.on('error', reject);
            formData.pipe(request);
        });

        const result = await uploadPromise;

        let responseData;
        try {
            responseData = result.data ? JSON.parse(result.data) : {};
        } catch (e) {
            responseData = { rawResponse: result.data };
        }

        console.log('Jira response status:', result.status);
        console.log('Jira response data:', responseData);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        if (result.status >= 200 && result.status < 300) {
            console.log('Success! Attachment uploaded:', responseData);
            res.status(200).json(responseData);
        } else {
            console.error('Jira API error response (status ' + result.status + '):', responseData);
            res.status(result.status).json({
                error: typeof responseData === 'string' ? responseData : JSON.stringify(responseData)
            });
        }
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('Add attachment error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Server-side list attachments endpoint
app.post('/list-attachments', async (req, res) => {
    const { authHeader, issueKey } = req.body;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    try {
        const response = await fetch(`https://mmn-service.atlassian.net/rest/api/3/issue/${issueKey}?fields=attachment`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const attachments = data.fields?.attachment || [];
            res.status(200).json(attachments);
        } else {
            const data = await response.text();
            res.status(response.status).json({ error: data });
        }
    } catch (error) {
        console.error('List attachments error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Server-side download attachment endpoint (proxy)
app.get('/download-attachment', async (req, res) => {
    const { url, auth } = req.query;

    if (!auth) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': auth,
                'Accept': '*/*'
            }
        });

        if (response.ok) {
            // Get the content type and file name from headers
            const contentType = response.headers.get('content-type');
            const contentDisposition = response.headers.get('content-disposition');

            // Set headers for download
            if (contentType) {
                res.setHeader('Content-Type', contentType);
            }
            if (contentDisposition) {
                res.setHeader('Content-Disposition', contentDisposition);
            }

            // Pipe the response body to the client
            const buffer = await response.arrayBuffer();
            res.send(Buffer.from(buffer));
        } else {
            res.status(response.status).json({ error: 'Failed to download attachment' });
        }
    } catch (error) {
        console.error('Download attachment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Server-side get issue reporter endpoint
app.post('/get-issue-reporter', async (req, res) => {
    const { authHeader, issueKey } = req.body;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    try {
        const response = await fetch(`https://mmn-service.atlassian.net/rest/api/3/issue/${issueKey}?fields=reporter,assignee,creator,summary`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            res.status(200).json({
                key: data.key,
                summary: data.fields.summary,
                reporter: data.fields.reporter,
                assignee: data.fields.assignee,
                creator: data.fields.creator
            });
        } else {
            const data = await response.text();
            res.status(response.status).json({ error: data });
        }
    } catch (error) {
        console.error('Get issue reporter error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Server-side update issue reporter endpoint
app.post('/update-issue-reporter', async (req, res) => {
    const { authHeader, issueKey, reporterEmail } = req.body;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    if (!reporterEmail) {
        return res.status(400).json({ error: 'Reporter email required' });
    }

    try {
        // First, search for the user by email to get their accountId
        const searchResponse = await fetch(`https://mmn-service.atlassian.net/rest/api/3/user/search?query=${encodeURIComponent(reporterEmail)}`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json'
            }
        });

        if (!searchResponse.ok) {
            return res.status(400).json({ error: 'User not found with that email' });
        }

        const users = await searchResponse.json();
        if (!users || users.length === 0) {
            return res.status(400).json({ error: 'No user found with that email address' });
        }

        const accountId = users[0].accountId;

        // Now update the issue reporter
        const updateResponse = await fetch(`https://mmn-service.atlassian.net/rest/api/3/issue/${issueKey}`, {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    reporter: {
                        accountId: accountId
                    }
                }
            })
        });

        if (updateResponse.ok || updateResponse.status === 204) {
            res.status(200).json({
                success: true,
                message: 'Reporter updated successfully',
                accountId: accountId,
                email: reporterEmail
            });
        } else {
            const errorText = await updateResponse.text();
            let errorMessage;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.errorMessages?.join(', ') || errorData.errors?.reporter || errorText;
            } catch (e) {
                errorMessage = errorText;
            }
            res.status(updateResponse.status).json({ error: errorMessage });
        }
    } catch (error) {
        console.error('Update issue reporter error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Server-side send email notification endpoint
app.post('/send-notification', async (req, res) => {
    const { authHeader, issueKey, subject, message, notifyReporter, notifyAssignee, additionalEmails } = req.body;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required' });
    }

    try {
        // Build the notification payload
        const notificationPayload = {
            subject: subject,
            textBody: message,
            htmlBody: message.replace(/\n/g, '<br>')
        };

        // Add recipients
        const to = {};

        if (notifyReporter) {
            to.reporter = true;
        }

        if (notifyAssignee) {
            to.assignee = true;
        }

        // Add additional email addresses
        if (additionalEmails && additionalEmails.length > 0) {
            // Search for users by email and add them
            const users = [];
            for (const email of additionalEmails) {
                try {
                    const searchResponse = await fetch(`https://mmn-service.atlassian.net/rest/api/3/user/search?query=${encodeURIComponent(email)}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': authHeader,
                            'Accept': 'application/json'
                        }
                    });

                    if (searchResponse.ok) {
                        const foundUsers = await searchResponse.json();
                        if (foundUsers && foundUsers.length > 0) {
                            users.push({ accountId: foundUsers[0].accountId });
                        }
                    }
                } catch (e) {
                    console.error('Error searching for user:', email, e);
                }
            }

            if (users.length > 0) {
                to.users = users;
            }
        }

        notificationPayload.to = to;

        console.log('Sending notification:', JSON.stringify(notificationPayload, null, 2));

        // Send the notification
        const response = await fetch(`https://mmn-service.atlassian.net/rest/api/3/issue/${issueKey}/notify`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(notificationPayload)
        });

        if (response.ok || response.status === 204) {
            // Notification sent successfully, now add a comment to the issue
            console.log('Notification sent, now adding comment to issue history...');

            try {
                const commentPayload = {
                    body: {
                        type: 'doc',
                        version: 1,
                        content: [{
                            type: 'paragraph',
                            content: [{
                                type: 'text',
                                text: `📧 Notification sent: ${subject}\n\n${message}`
                            }]
                        }]
                    }
                };

                const commentResponse = await fetch(`https://mmn-service.atlassian.net/rest/api/3/issue/${issueKey}/comment`, {
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(commentPayload)
                });

                if (commentResponse.ok) {
                    console.log('Comment added to issue history successfully');
                    res.status(200).json({
                        success: true,
                        message: 'Notification sent and saved to issue history'
                    });
                } else {
                    // Notification sent but comment failed
                    console.error('Failed to add comment to issue');
                    res.status(200).json({
                        success: true,
                        message: 'Notification sent but failed to save to issue history',
                        warning: 'Comment could not be added'
                    });
                }
            } catch (commentError) {
                console.error('Error adding comment:', commentError);
                res.status(200).json({
                    success: true,
                    message: 'Notification sent but failed to save to issue history',
                    warning: 'Comment could not be added'
                });
            }
        } else {
            const errorText = await response.text();
            let errorMessage;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.errorMessages?.join(', ') || errorData.errors ? JSON.stringify(errorData.errors) : errorText;
            } catch (e) {
                errorMessage = errorText;
            }
            console.error('Notification error:', errorMessage);
            res.status(response.status).json({ error: errorMessage });
        }
    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Server-side transition execution endpoint
app.post('/execute-transition', async (req, res) => {
    const { authHeader, issueKey, transitionId } = req.body;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    try {
        const response = await fetch(`https://mmn-service.atlassian.net/rest/api/3/issue/${issueKey}/transitions`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transition: { id: transitionId }
            })
        });

        if (response.ok || response.status === 204) {
            res.status(200).json({ success: true });
        } else {
            const data = await response.text();
            res.status(response.status).json({ error: data });
        }
    } catch (error) {
        console.error('Execute transition error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Server-side issue creation endpoint (bypasses browser XSRF)
app.post('/create-issue', async (req, res) => {
    const { authHeader, projectKey, projectType, requestTypeId, issueType, summary, description } = req.body;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    try {
        let url, requestBody;

        if (projectType === 'servicedesk') {
            // Get service desk ID first
            const sdResponse = await fetch(`https://mmn-service.atlassian.net/rest/servicedeskapi/servicedesk/${projectKey}`, {
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json'
                }
            });

            if (!sdResponse.ok) {
                return res.status(400).json({ error: 'Service desk not found' });
            }

            const sdData = await sdResponse.json();
            const serviceDeskId = sdData.id;

            url = `https://mmn-service.atlassian.net/rest/servicedeskapi/request`;
            requestBody = {
                serviceDeskId: serviceDeskId,
                requestTypeId: requestTypeId,
                requestFieldValues: {
                    summary: summary,
                    description: description
                }
            };
        } else {
            url = `https://mmn-service.atlassian.net/rest/api/3/issue`;
            requestBody = {
                fields: {
                    project: { key: projectKey },
                    summary: summary,
                    description: {
                        type: 'doc',
                        version: 1,
                        content: [{
                            type: 'paragraph',
                            content: [{ type: 'text', text: description }]
                        }]
                    },
                    issuetype: { name: issueType }
                }
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.text();

        if (response.ok) {
            res.status(200).json(JSON.parse(data));
        } else {
            res.status(response.status).json({ error: data });
        }

    } catch (error) {
        console.error('Create issue error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Proxy endpoint for Jira API
app.all('/api/*', async (req, res) => {
    const jiraPath = req.path.replace('/api', '');
    const jiraUrl = `${JIRA_DOMAIN}${jiraPath}`;

    // Get auth header from request
    const authHeader = req.headers.authorization;

    console.log(`\n=== Request Details ===`);
    console.log(`Path: ${req.path}`);
    console.log(`Method: ${req.method}`);
    console.log(`Auth header received: ${authHeader ? authHeader.substring(0, 20) + '...' : 'NONE'}`);

    // Decode and log the credentials (for debugging)
    if (authHeader && authHeader.startsWith('Basic ')) {
        try {
            const base64Credentials = authHeader.split(' ')[1];
            const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
            const [email] = credentials.split(':');
            console.log(`Decoded email: ${email}`);
            console.log(`Credentials format looks correct: ${credentials.includes(':')}`);
        } catch (e) {
            console.log('Could not decode auth header');
        }
    }

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
    }

    try {
        const headers = {
            'Authorization': authHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-Atlassian-Token': 'no-check',
            'X-ExperimentalApi': 'opt-in'
        };

        const options = {
            method: req.method,
            headers: headers
        };

        // Add body for POST/PUT requests
        if (req.method === 'POST' || req.method === 'PUT') {
            options.body = JSON.stringify(req.body);
        }

        console.log(`[${req.method}] ${jiraUrl}`);
        console.log('Request headers:', JSON.stringify(headers, null, 2));
        if (options.body) {
            console.log('Request body preview:', options.body.substring(0, 200));
        }

        const response = await fetch(jiraUrl, options);
        const contentType = response.headers.get('content-type');

        console.log(`Response status: ${response.status}, Content-Type: ${contentType}`);

        // Handle empty responses (like 204 No Content)
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return res.status(response.status).send();
        }

        // Get response text first
        const text = await response.text();

        // Try to parse as JSON if content-type suggests it or if response has content
        if (text) {
            try {
                // Try to parse as JSON first
                const data = JSON.parse(text);
                return res.status(response.status).json(data);
            } catch (parseError) {
                // If it's not JSON, treat it as an error message
                console.error('Response is not JSON. Text:', text.substring(0, 500));
                return res.status(response.status).json({
                    message: text,
                    errorMessages: [text]
                });
            }
        } else {
            // Empty response
            return res.status(response.status).send();
        }

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: 'Proxy error',
            message: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`\n✓ Jira API Tester server running at http://localhost:${PORT}`);
    console.log(`✓ Open http://localhost:${PORT}/jira-api-tester.html in your browser\n`);
});
