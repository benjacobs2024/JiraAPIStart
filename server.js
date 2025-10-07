const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

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
