# Jira Cloud Integration - Developer Guide

## Overview

This repository contains a reference implementation for integrating with Jira Cloud REST APIs. It demonstrates the four core operations required for most Jira integrations:

1. **Authentication** - Using email and API tokens
2. **Issue Creation** - Creating issues in both regular Jira projects and Service Desk projects
3. **Workflow Transitions** - Moving issues through workflow states
4. **Adding Comments** - Posting comments to existing issues

This codebase serves as both a working example and a testing tool for developers building Jira integrations.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Authentication](#authentication)
- [API Operations](#api-operations)
  - [Creating Issues](#creating-issues)
  - [Transitioning Issues](#transitioning-issues)
  - [Adding Comments](#adding-comments)
- [Understanding XSRF/CSRF Protection](#understanding-xsrfcsrf-protection)
- [Code Examples](#code-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

---

## Quick Start

### Prerequisites

- Node.js 14+ and npm
- Access to a Jira Cloud instance
- Jira API token (generate at: https://id.atlassian.com/manage-profile/security/api-tokens)
- Basic understanding of REST APIs

### Installation

```bash
# Clone the repository
git clone https://github.com/benjacobs2024/JiraAPIStart.git
cd JiraAPIStart

# Install dependencies
npm install

# Start the server
npm start
```

### Access the Web Interface

Open your browser to: `http://localhost:3000/jira-api-tester.html`

---

## Architecture Overview

This reference implementation uses a **proxy server pattern** to handle Jira API interactions:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │ ──────> │  Node.js    │ ──────> │   Jira      │
│   (Client)  │         │  Proxy      │         │   Cloud     │
└─────────────┘         └─────────────┘         └─────────────┘
```

### Why Use a Proxy Server?

Jira Cloud implements strict **CSRF (Cross-Site Request Forgery) protection** that blocks direct browser-to-Jira API calls for state-changing operations (POST, PUT, DELETE). The proxy server approach:

- ✅ Bypasses browser-based CSRF protection
- ✅ Centralizes API authentication
- ✅ Provides better error handling
- ✅ Allows request/response logging
- ✅ Can implement rate limiting and caching

### File Structure

```
JiraTestSample/
├── server.js                 # Node.js proxy server
├── jira-api-tester.html      # Web-based testing interface
├── package.json              # Dependencies
├── .gitignore               # Git ignore rules
├── README.md                # Basic documentation
└── DEVELOPER_GUIDE.md       # This file
```

---

## Authentication

### How Jira Cloud Authentication Works

Jira Cloud uses **Basic Authentication** with:
- **Username**: Your Atlassian account email
- **Password**: An API token (NOT your Atlassian password)

### Generating an API Token

1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Give it a descriptive label
4. Copy the token immediately (you won't see it again)

### Authentication in Code

#### JavaScript/Node.js Example

```javascript
// Create Basic Auth header
const email = 'your-email@example.com';
const apiToken = 'your-api-token-here';
const authString = `${email}:${apiToken}`;
const base64Auth = Buffer.from(authString).toString('base64');
const authHeader = `Basic ${base64Auth}`;

// Make authenticated request
const response = await fetch('https://your-domain.atlassian.net/rest/api/3/myself', {
    method: 'GET',
    headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});

const userData = await response.json();
console.log('Authenticated as:', userData.displayName);
```

#### cURL Example

```bash
curl -u "your-email@example.com:your-api-token" \
  -H "Accept: application/json" \
  https://your-domain.atlassian.net/rest/api/3/myself
```

### Testing Authentication

Use the `/rest/api/3/myself` endpoint to verify credentials:

```javascript
async function validateAuth(domain, email, apiToken) {
    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

    const response = await fetch(`${domain}/rest/api/3/myself`, {
        headers: { 'Authorization': authHeader }
    });

    return response.ok;
}
```

**Security Best Practices:**
- ✅ Store API tokens in environment variables
- ✅ Never commit tokens to version control
- ✅ Use separate tokens for dev/staging/production
- ✅ Rotate tokens regularly
- ✅ Revoke unused tokens immediately

---

## API Operations

### Creating Issues

Jira has two types of projects with different creation APIs:

#### Regular Jira Projects

**Endpoint:** `POST /rest/api/3/issue`

**Request Body:**
```json
{
  "fields": {
    "project": {
      "key": "PROJ"
    },
    "summary": "Issue title",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Issue description text"
            }
          ]
        }
      ]
    },
    "issuetype": {
      "name": "Task"
    }
  }
}
```

**Node.js Implementation:**

```javascript
async function createJiraIssue(domain, authHeader, projectKey, issueType, summary, description) {
    const response = await fetch(`${domain}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
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
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to create issue: ${response.statusText}`);
    }

    const data = await response.json();
    return data.key; // Returns issue key like "PROJ-123"
}
```

#### Service Desk Projects

Service Desk projects require a different API and use **Request Types** instead of Issue Types.

**Step 1: Get Service Desk ID**
```javascript
// Convert project key to numeric service desk ID
const sdResponse = await fetch(
    `${domain}/rest/servicedeskapi/servicedesk/${projectKey}`,
    { headers: { 'Authorization': authHeader } }
);
const sdData = await sdResponse.json();
const serviceDeskId = sdData.id;
```

**Step 2: Get Available Request Types**
```javascript
const rtResponse = await fetch(
    `${domain}/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype`,
    { headers: { 'Authorization': authHeader } }
);
const rtData = await rtResponse.json();
console.log('Request types:', rtData.values);
```

**Step 3: Create Service Desk Request**

**Endpoint:** `POST /rest/servicedeskapi/request`

```javascript
async function createServiceDeskRequest(domain, authHeader, projectKey, requestTypeId, summary, description) {
    // Get service desk ID
    const sdResponse = await fetch(
        `${domain}/rest/servicedeskapi/servicedesk/${projectKey}`,
        { headers: { 'Authorization': authHeader } }
    );
    const { id: serviceDeskId } = await sdResponse.json();

    // Create request
    const response = await fetch(`${domain}/rest/servicedeskapi/request`, {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            serviceDeskId: serviceDeskId,
            requestTypeId: requestTypeId,
            requestFieldValues: {
                summary: summary,
                description: description
            }
        })
    });

    const data = await response.json();
    return data.issueKey;
}
```

**Important Notes:**
- Service Desk projects use **numeric IDs**, not project keys
- Request Type IDs are numeric (e.g., 1, 10, 25)
- The field structure is different (`requestFieldValues` vs `fields`)

---

### Transitioning Issues

Workflow transitions move issues between statuses (e.g., "To Do" → "In Progress" → "Done").

**Process:**
1. Get available transitions for an issue
2. Display transition options to user
3. Execute chosen transition

#### Get Available Transitions

**Endpoint:** `GET /rest/api/3/issue/{issueKey}/transitions`

```javascript
async function getAvailableTransitions(domain, authHeader, issueKey) {
    const response = await fetch(
        `${domain}/rest/api/3/issue/${issueKey}/transitions`,
        { headers: { 'Authorization': authHeader } }
    );

    const data = await response.json();
    return data.transitions.map(t => ({
        id: t.id,
        name: t.name,
        to: t.to.name  // Target status
    }));
}

// Example output:
// [
//   { id: '11', name: 'Start Progress', to: 'In Progress' },
//   { id: '21', name: 'Done', to: 'Done' }
// ]
```

#### Execute Transition

**Endpoint:** `POST /rest/api/3/issue/{issueKey}/transitions`

```javascript
async function executeTransition(domain, authHeader, issueKey, transitionId) {
    const response = await fetch(
        `${domain}/rest/api/3/issue/${issueKey}/transitions`,
        {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transition: { id: transitionId }
            })
        }
    );

    // Returns 204 No Content on success
    return response.ok;
}
```

**Complete Example:**

```javascript
async function transitionIssue(domain, authHeader, issueKey, targetStatusName) {
    // Get available transitions
    const transitions = await getAvailableTransitions(domain, authHeader, issueKey);

    // Find transition to target status
    const transition = transitions.find(t => t.to === targetStatusName);

    if (!transition) {
        throw new Error(`No transition available to status "${targetStatusName}"`);
    }

    // Execute transition
    await executeTransition(domain, authHeader, issueKey, transition.id);

    console.log(`Successfully transitioned ${issueKey} to ${targetStatusName}`);
}

// Usage
await transitionIssue('https://your-domain.atlassian.net', authHeader, 'PROJ-123', 'In Progress');
```

**Important Notes:**
- Transitions are **workflow-specific** - different projects may have different transitions
- Available transitions depend on the **current status** of the issue
- Transition IDs are **strings**, not numbers
- Some transitions may require additional fields (check `transition.fields`)

---

### Adding Comments

Comments can be added to any issue you have permission to view.

**Endpoint:** `POST /rest/api/3/issue/{issueKey}/comment`

#### Basic Comment

```javascript
async function addComment(domain, authHeader, issueKey, commentText) {
    const response = await fetch(
        `${domain}/rest/api/3/issue/${issueKey}/comment`,
        {
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
                            text: commentText
                        }]
                    }]
                }
            })
        }
    );

    const data = await response.json();
    return data.id; // Comment ID
}
```

#### Formatted Comments (Atlassian Document Format)

Jira uses **Atlassian Document Format (ADF)** for rich text:

```javascript
// Comment with formatting
const formattedComment = {
    body: {
        type: 'doc',
        version: 1,
        content: [
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'This is ' },
                    { type: 'text', text: 'bold text', marks: [{ type: 'strong' }] },
                    { type: 'text', text: ' and ' },
                    { type: 'text', text: 'italic text', marks: [{ type: 'em' }] }
                ]
            },
            {
                type: 'bulletList',
                content: [
                    {
                        type: 'listItem',
                        content: [{
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'First item' }]
                        }]
                    },
                    {
                        type: 'listItem',
                        content: [{
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Second item' }]
                        }]
                    }
                ]
            }
        ]
    }
};
```

#### Mentioning Users

```javascript
// Comment that mentions a user
const mentionComment = {
    body: {
        type: 'doc',
        version: 1,
        content: [{
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Hey ' },
                {
                    type: 'mention',
                    attrs: {
                        id: '5b10a2844c20165700ede21g', // User account ID
                        text: '@John Doe'
                    }
                },
                { type: 'text', text: ', please review this.' }
            ]
        }]
    }
};
```

**Getting User Account IDs:**
```javascript
// Search for users
const searchResponse = await fetch(
    `${domain}/rest/api/3/user/search?query=${encodeURIComponent(email)}`,
    { headers: { 'Authorization': authHeader } }
);
const users = await searchResponse.json();
const accountId = users[0]?.accountId;
```

---

## Understanding XSRF/CSRF Protection

### The Challenge

Atlassian Cloud implements **XSRF (Cross-Site Request Forgery) protection** that prevents direct browser-to-Jira API calls for state-changing operations.

**What Gets Blocked:**
- ❌ Browser JavaScript → Jira (POST/PUT/DELETE)
- ❌ CORS requests from localhost
- ❌ Requests without proper XSRF tokens

**What Works:**
- ✅ Server-side code → Jira
- ✅ cURL → Jira
- ✅ Requests through a proxy server

### Why This Reference Implementation Uses a Proxy

```javascript
// ❌ This FAILS from browser JavaScript:
fetch('https://domain.atlassian.net/rest/api/3/issue', {
    method: 'POST',
    headers: { 'Authorization': authHeader },
    body: JSON.stringify(issueData)
});
// Error: XSRF check failed

// ✅ This WORKS through our proxy:
fetch('http://localhost:3000/create-issue', {
    method: 'POST',
    body: JSON.stringify({ authHeader, ...issueData })
});
// Proxy makes the actual call to Jira
```

### Implementing Your Own Proxy

The key endpoints in our reference `server.js`:

```javascript
// Proxy for creating issues
app.post('/create-issue', async (req, res) => {
    const { authHeader, projectKey, summary, description } = req.body;

    // Make request to Jira from server-side
    const response = await fetch('https://domain.atlassian.net/rest/api/3/issue', {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fields: { /* ... */ }
        })
    });

    // Return result to client
    const data = await response.json();
    res.json(data);
});
```

### Alternatives to a Proxy Server

1. **Server-Side Integration** - Make all Jira API calls from your backend
2. **OAuth 2.0** - Use OAuth for browser-based apps (more complex)
3. **Jira Connect Apps** - Build as an Atlassian Connect add-on
4. **Direct API Integration** - Call Jira APIs from your server, not the browser

**Recommendation:** For most integrations, make Jira API calls from your **backend server**, not from browser JavaScript.

---

## Code Examples

### Complete Integration Example

Here's a complete example of a Node.js integration:

```javascript
const fetch = require('node-fetch');

class JiraClient {
    constructor(domain, email, apiToken) {
        this.domain = domain;
        this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
    }

    async makeRequest(method, endpoint, body = null) {
        const options = {
            method,
            headers: {
                'Authorization': this.authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.domain}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Jira API error: ${response.status} - ${error}`);
        }

        // Handle empty responses (204 No Content)
        if (response.status === 204) {
            return null;
        }

        return await response.json();
    }

    async validateAuth() {
        const data = await this.makeRequest('GET', '/rest/api/3/myself');
        return data.displayName;
    }

    async createIssue(projectKey, issueType, summary, description) {
        const data = await this.makeRequest('POST', '/rest/api/3/issue', {
            fields: {
                project: { key: projectKey },
                summary,
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
        });
        return data.key;
    }

    async getTransitions(issueKey) {
        const data = await this.makeRequest('GET', `/rest/api/3/issue/${issueKey}/transitions`);
        return data.transitions;
    }

    async transitionIssue(issueKey, transitionId) {
        await this.makeRequest('POST', `/rest/api/3/issue/${issueKey}/transitions`, {
            transition: { id: transitionId }
        });
    }

    async addComment(issueKey, commentText) {
        const data = await this.makeRequest('POST', `/rest/api/3/issue/${issueKey}/comment`, {
            body: {
                type: 'doc',
                version: 1,
                content: [{
                    type: 'paragraph',
                    content: [{ type: 'text', text: commentText }]
                }]
            }
        });
        return data.id;
    }
}

// Usage
async function main() {
    const jira = new JiraClient(
        'https://your-domain.atlassian.net',
        'your-email@example.com',
        'your-api-token'
    );

    // Validate authentication
    const user = await jira.validateAuth();
    console.log(`Authenticated as: ${user}`);

    // Create an issue
    const issueKey = await jira.createIssue('PROJ', 'Task', 'Test Issue', 'This is a test');
    console.log(`Created issue: ${issueKey}`);

    // Get transitions
    const transitions = await jira.getTransitions(issueKey);
    console.log('Available transitions:', transitions.map(t => t.name));

    // Transition to "In Progress"
    const progressTransition = transitions.find(t => t.to.name === 'In Progress');
    if (progressTransition) {
        await jira.transitionIssue(issueKey, progressTransition.id);
        console.log(`Transitioned ${issueKey} to In Progress`);
    }

    // Add a comment
    await jira.addComment(issueKey, 'Integration test completed successfully');
    console.log('Comment added');
}

main().catch(console.error);
```

### Python Example

```python
import requests
import base64
import json

class JiraClient:
    def __init__(self, domain, email, api_token):
        self.domain = domain
        credentials = f"{email}:{api_token}"
        encoded = base64.b64encode(credentials.encode()).decode()
        self.headers = {
            'Authorization': f'Basic {encoded}',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }

    def create_issue(self, project_key, issue_type, summary, description):
        url = f"{self.domain}/rest/api/3/issue"
        payload = {
            "fields": {
                "project": {"key": project_key},
                "summary": summary,
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [{
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description}]
                    }]
                },
                "issuetype": {"name": issue_type}
            }
        }

        response = requests.post(url, headers=self.headers, json=payload)
        response.raise_for_status()
        return response.json()['key']

    def add_comment(self, issue_key, comment_text):
        url = f"{self.domain}/rest/api/3/issue/{issue_key}/comment"
        payload = {
            "body": {
                "type": "doc",
                "version": 1,
                "content": [{
                    "type": "paragraph",
                    "content": [{"type": "text", "text": comment_text}]
                }]
            }
        }

        response = requests.post(url, headers=self.headers, json=payload)
        response.raise_for_status()
        return response.json()['id']

# Usage
jira = JiraClient('https://your-domain.atlassian.net', 'email@example.com', 'api-token')
issue_key = jira.create_issue('PROJ', 'Task', 'Test Issue', 'Description')
jira.add_comment(issue_key, 'Test comment')
```

---

## Best Practices

### 1. Error Handling

Always implement proper error handling:

```javascript
async function safeJiraRequest(makeRequest) {
    try {
        return await makeRequest();
    } catch (error) {
        // Parse Jira error responses
        if (error.response) {
            const jiraError = await error.response.json();
            console.error('Jira API Error:', {
                status: error.response.status,
                errors: jiraError.errors,
                errorMessages: jiraError.errorMessages
            });
        } else {
            console.error('Network Error:', error.message);
        }
        throw error;
    }
}
```

### 2. Rate Limiting

Jira Cloud has rate limits. Implement exponential backoff:

```javascript
async function requestWithRetry(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (error.response?.status === 429) {
                const retryAfter = error.response.headers.get('Retry-After') || Math.pow(2, i);
                console.log(`Rate limited. Retrying after ${retryAfter}s...`);
                await sleep(retryAfter * 1000);
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries exceeded');
}
```

### 3. Pagination

Handle paginated results:

```javascript
async function getAllIssues(domain, authHeader, jql) {
    let startAt = 0;
    const maxResults = 50;
    const allIssues = [];

    while (true) {
        const response = await fetch(
            `${domain}/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`,
            { headers: { 'Authorization': authHeader } }
        );

        const data = await response.json();
        allIssues.push(...data.issues);

        if (data.issues.length < maxResults) {
            break;
        }

        startAt += maxResults;
    }

    return allIssues;
}
```

### 4. Caching

Cache frequently accessed data:

```javascript
class CachedJiraClient extends JiraClient {
    constructor(domain, email, apiToken) {
        super(domain, email, apiToken);
        this.cache = new Map();
        this.cacheTTL = 60000; // 1 minute
    }

    async getProjectMeta(projectKey) {
        const cacheKey = `project:${projectKey}`;
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }

        const data = await this.makeRequest('GET', `/rest/api/3/project/${projectKey}`);
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    }
}
```

### 5. Logging

Implement comprehensive logging:

```javascript
class LoggedJiraClient extends JiraClient {
    async makeRequest(method, endpoint, body) {
        const requestId = Math.random().toString(36).substring(7);

        console.log(`[${requestId}] ${method} ${endpoint}`, {
            timestamp: new Date().toISOString(),
            body: body ? JSON.stringify(body).substring(0, 100) : null
        });

        const startTime = Date.now();

        try {
            const result = await super.makeRequest(method, endpoint, body);
            const duration = Date.now() - startTime;

            console.log(`[${requestId}] Success (${duration}ms)`);
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`[${requestId}] Error (${duration}ms):`, error.message);
            throw error;
        }
    }
}
```

---

## Troubleshooting

### Common Issues

#### 1. "XSRF check failed"

**Problem:** Direct browser-to-Jira API calls are blocked.

**Solution:**
- Make API calls from server-side code
- Use the proxy pattern (as shown in this repo)
- Never make state-changing API calls directly from browser JavaScript

#### 2. "Client must be authenticated"

**Problem:** Invalid credentials or incorrect authentication format.

**Solutions:**
- Verify email is correct (must match Atlassian account)
- Regenerate API token
- Check for whitespace in email/token
- Ensure Base64 encoding is correct:
  ```javascript
  // Correct
  Buffer.from(`${email}:${apiToken}`).toString('base64')

  // Wrong (common mistake)
  btoa(`${email}:${apiToken}`) // May fail with non-ASCII characters
  ```

#### 3. "Field 'x' cannot be set"

**Problem:** Trying to set a field that doesn't exist or isn't allowed for the issue type.

**Solutions:**
- Get field metadata: `GET /rest/api/3/issue/createmeta`
- Check required fields for issue type
- Verify field is editable

```javascript
// Get create metadata for a project
async function getCreateMeta(domain, authHeader, projectKey) {
    const response = await fetch(
        `${domain}/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`,
        { headers: { 'Authorization': authHeader } }
    );
    return await response.json();
}
```

#### 4. "Transition is not valid"

**Problem:** Trying to execute a transition that isn't available from the current status.

**Solution:** Always fetch available transitions before attempting to execute:

```javascript
async function safeTransition(domain, authHeader, issueKey, targetStatus) {
    const transitions = await getAvailableTransitions(domain, authHeader, issueKey);
    const validTransition = transitions.find(t => t.to === targetStatus);

    if (!validTransition) {
        throw new Error(`Cannot transition to "${targetStatus}" from current status`);
    }

    await executeTransition(domain, authHeader, issueKey, validTransition.id);
}
```

#### 5. Rate Limiting (429 errors)

**Problem:** Too many requests in a short time.

**Solution:** Implement rate limiting and exponential backoff (see Best Practices above).

**Jira Cloud Rate Limits:**
- REST API: ~100 requests per minute per IP
- Varies by plan and endpoint
- Check `X-RateLimit-*` headers in responses

#### 6. Service Desk "404 Not Found"

**Problem:** Trying to create a Service Desk request with wrong parameters.

**Solutions:**
- Verify the project is actually a Service Desk project
- Use numeric `serviceDeskId`, not project key
- Ensure requestTypeId is valid for that service desk
- Check you have the correct permissions

---

## API Reference

### Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rest/api/3/myself` | GET | Validate authentication |
| `/rest/api/3/issue` | POST | Create issue (regular projects) |
| `/rest/api/3/issue/{key}` | GET | Get issue details |
| `/rest/api/3/issue/{key}/transitions` | GET | Get available transitions |
| `/rest/api/3/issue/{key}/transitions` | POST | Execute transition |
| `/rest/api/3/issue/{key}/comment` | POST | Add comment |
| `/rest/servicedeskapi/servicedesk/{projectKey}` | GET | Get Service Desk info |
| `/rest/servicedeskapi/servicedesk/{id}/requesttype` | GET | Get request types |
| `/rest/servicedeskapi/request` | POST | Create Service Desk request |

### Response Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response data |
| 201 | Created | Resource created successfully |
| 204 | No Content | Success, no response body |
| 400 | Bad Request | Check request payload |
| 401 | Unauthorized | Check authentication credentials |
| 403 | Forbidden | Check permissions / XSRF issue |
| 404 | Not Found | Check resource exists |
| 429 | Too Many Requests | Implement rate limiting |
| 500 | Server Error | Retry with exponential backoff |

---

## Testing Your Integration

### Test Checklist

Use this checklist to verify your integration:

- [ ] **Authentication**
  - [ ] Can successfully authenticate with email + API token
  - [ ] Returns user information
  - [ ] Handles invalid credentials gracefully

- [ ] **Issue Creation**
  - [ ] Can create issues in regular Jira projects
  - [ ] Can create requests in Service Desk projects
  - [ ] Required fields are properly validated
  - [ ] Returns created issue key

- [ ] **Transitions**
  - [ ] Can fetch available transitions for an issue
  - [ ] Can execute valid transitions
  - [ ] Handles invalid transitions with clear errors
  - [ ] Issue status updates correctly

- [ ] **Comments**
  - [ ] Can add simple text comments
  - [ ] Can add formatted comments (if needed)
  - [ ] Comments appear correctly in Jira UI

- [ ] **Error Handling**
  - [ ] Network errors are caught and logged
  - [ ] Jira API errors are parsed and displayed
  - [ ] Rate limiting is handled with retries
  - [ ] Validation errors are user-friendly

### Testing with the Reference Implementation

1. **Start the test server:**
   ```bash
   npm start
   ```

2. **Open test interface:**
   ```
   http://localhost:3000/jira-api-tester.html
   ```

3. **Test each operation:**
   - Enter your test credentials
   - Try creating an issue
   - Test transitions on the created issue
   - Add comments
   - Verify in Jira UI

### Automated Testing

Example Jest test:

```javascript
const JiraClient = require('./jira-client');

describe('Jira Integration', () => {
    let jira;

    beforeAll(() => {
        jira = new JiraClient(
            process.env.JIRA_DOMAIN,
            process.env.JIRA_EMAIL,
            process.env.JIRA_API_TOKEN
        );
    });

    test('should authenticate successfully', async () => {
        const user = await jira.validateAuth();
        expect(user).toBeTruthy();
    });

    test('should create an issue', async () => {
        const issueKey = await jira.createIssue(
            'TEST',
            'Task',
            'Automated test issue',
            'Created by integration tests'
        );
        expect(issueKey).toMatch(/^TEST-\d+$/);
    });
});
```

---

## Security Considerations

### DO ✅

- Store API tokens in environment variables or secure vaults
- Use HTTPS for all API communications
- Implement token rotation policies
- Log API access for audit trails
- Validate all input before sending to Jira
- Use least-privilege API tokens (create separate tokens for different purposes)
- Revoke tokens immediately when compromised or no longer needed

### DON'T ❌

- Never commit API tokens to version control
- Never log full API tokens (log only first/last 4 characters)
- Never send credentials in URLs or query parameters
- Never use Atlassian account passwords (always use API tokens)
- Never store tokens in browser localStorage or sessionStorage
- Never expose API tokens in client-side code
- Never share API tokens between environments (dev/staging/prod)

### Token Security Example

```javascript
// .env file (never commit this!)
JIRA_DOMAIN=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-secret-token

// In your code
require('dotenv').config();

const jira = new JiraClient(
    process.env.JIRA_DOMAIN,
    process.env.JIRA_EMAIL,
    process.env.JIRA_API_TOKEN
);

// Safe logging
console.log(`Using token: ${process.env.JIRA_API_TOKEN.substring(0, 4)}...${process.env.JIRA_API_TOKEN.slice(-4)}`);
```

---

## Additional Resources

### Official Documentation

- **Jira Cloud REST API**: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
- **Service Desk API**: https://developer.atlassian.com/cloud/jira/service-desk/rest/
- **Authentication**: https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
- **Atlassian Document Format**: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/

### Community Resources

- **Atlassian Developer Community**: https://community.developer.atlassian.com/
- **API Rate Limits**: https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
- **Postman Collection**: Available in Atlassian Marketplace

### Support

For issues with this reference implementation:
- Open an issue on GitHub: https://github.com/benjacobs2024/JiraAPIStart/issues
- Contact: [YOUR_CONTACT_INFO]

For Jira API issues:
- Atlassian Support: https://support.atlassian.com/
- Developer Community Forums

---

## Changelog

### Version 1.0.0
- Initial release
- Authentication implementation
- Issue creation (regular + Service Desk)
- Workflow transitions
- Comment functionality
- Web-based testing interface
- Node.js proxy server

---

## License

[Specify your license here]

---

## Contributing

[Specify contribution guidelines if accepting external contributions]

---

**Questions?** Reach out to [YOUR_CONTACT_INFO] or open an issue in the repository.

**Need help integrating?** Contact [YOUR_SUPPORT_TEAM] for integration assistance.
