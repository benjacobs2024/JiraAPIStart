# Jira Cloud API - Reference Implementation

> A reference implementation and testing tool for integrating with Jira Cloud REST APIs.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Overview

This repository provides a **complete reference implementation** for integrating with Jira Cloud APIs, demonstrating:

1. ✅ **Authentication** - Email + API token authentication
2. ✅ **Issue Creation** - Regular Jira projects and Service Desk projects
3. ✅ **Workflow Transitions** - Moving issues through statuses
4. ✅ **Comments** - Adding comments to issues
5. ✅ **Attachments** - Uploading files to existing issues
6. ✅ **List & Download Attachments** - View and download attachments from issues
7. ✅ **Reporter Management** - View issue reporter, assignee, creator and update reporter
8. ✅ **Email Notifications** - Send custom email notifications to reporter, assignee, or specific users

Includes a web-based testing interface and Node.js proxy server to help developers understand and test Jira API integrations.

## Quick Start

```bash
# Clone repository
git clone https://github.com/benjacobs2024/JiraAPIStart.git
cd JiraAPIStart

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Jira domain

# Start server
npm start

# Open in browser
open http://localhost:3000/jira-api-tester.html
```

## Documentation

📖 **[Developer Guide](DEVELOPER_GUIDE.md)** - Comprehensive integration guide with code examples

The Developer Guide includes:
- Complete API documentation
- Code examples in JavaScript and Python
- Understanding XSRF/CSRF protection
- Best practices and error handling
- Troubleshooting common issues
- Security considerations

## Features

### Web Testing Interface

- **Authentication Testing** - Validate credentials
- **Issue Creation** - Both regular and Service Desk projects
- **Request Type Discovery** - Auto-fetch available Service Desk request types
- **Workflow Transitions** - Test state changes
- **Comment Testing** - Add comments to issues
- **Attachment Upload** - Upload files to existing issues (up to 10MB)
- **List Attachments** - View all attachments on an issue with metadata
- **Download Attachments** - Download attachments directly from the browser
- **Reporter Management** - View reporter, assignee, and creator with avatars
- **Update Reporter** - Change the reporter by searching user email
- **Email Notifications** - Send custom notifications to reporter, assignee, or additional users
- **Custom Notification Content** - Compose subject and message for notifications
- **Notification History** - Notification messages are automatically saved as comments in the issue

### Proxy Server Pattern

The reference implementation uses a **server-side proxy** to bypass browser XSRF/CSRF restrictions:

```
Browser → Node.js Proxy → Jira Cloud API
```

This pattern is necessary because Jira Cloud blocks direct browser-to-API calls for security. See [Developer Guide](DEVELOPER_GUIDE.md#understanding-xsrfcsrf-protection) for details.

## Project Structure

```
JiraTestSample/
├── server.js                 # Node.js proxy server
├── jira-api-tester.html      # Web testing interface
├── package.json              # Dependencies
├── .env.example             # Example environment configuration
├── .env                      # Your environment configuration (create from .env.example)
├── .gitignore               # Git ignore rules
├── DEVELOPER_GUIDE.md        # Complete integration guide
└── README.md                 # This file
```

## Prerequisites

- Node.js 14+
- Jira Cloud instance access
- Jira API token ([Generate here](https://id.atlassian.com/manage-profile/security/api-tokens))

## Configuration

### Environment Variables (Recommended)

Create a `.env` file in the project root:

```bash
JIRA_DOMAIN=https://your-domain.atlassian.net
PORT=3000
```

### Alternative: Direct Configuration

You can also update the Jira domain directly in `server.js`:

```javascript
const JIRA_DOMAIN = process.env.JIRA_DOMAIN || 'https://your-domain.atlassian.net';
```

**Note:** The `.env` file is git-ignored to prevent accidental commits of sensitive configuration.

## API Endpoints Demonstrated

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Validate Auth | `/rest/api/3/myself` | GET |
| Create Issue | `/rest/api/3/issue` | POST |
| Create Service Request | `/rest/servicedeskapi/request` | POST |
| Get Transitions | `/rest/api/3/issue/{key}/transitions` | GET |
| Execute Transition | `/rest/api/3/issue/{key}/transitions` | POST |
| Add Comment | `/rest/api/3/issue/{key}/comment` | POST |
| Add Attachment | `/rest/api/3/issue/{key}/attachments` | POST |
| List Attachments | `/rest/api/3/issue/{key}?fields=attachment` | GET |
| Download Attachment | Attachment content URL | GET |
| Get Issue Reporter | `/rest/api/3/issue/{key}?fields=reporter,assignee,creator,summary` | GET |
| Search User | `/rest/api/3/user/search?query={email}` | GET |
| Update Reporter | `/rest/api/3/issue/{key}` | PUT |
| Send Notification | `/rest/api/3/issue/{key}/notify` | POST |

## Usage Example

```javascript
// Complete integration example
const JiraClient = require('./jira-client');

const jira = new JiraClient(
    'https://your-domain.atlassian.net',
    'your-email@example.com',
    'your-api-token'
);

// Create issue
const issueKey = await jira.createIssue('PROJ', 'Task', 'Title', 'Description');

// Add comment
await jira.addComment(issueKey, 'Integration successful!');

// Transition to "In Progress"
const transitions = await jira.getTransitions(issueKey);
const transition = transitions.find(t => t.to.name === 'In Progress');
await jira.transitionIssue(issueKey, transition.id);
```

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for complete examples.

## Security

⚠️ **Important Security Notes:**

- Never commit API tokens to version control
- Store tokens in environment variables or secure vaults
- Use separate tokens for different environments
- Rotate tokens regularly
- Revoke tokens immediately when compromised

See [Security Considerations](DEVELOPER_GUIDE.md#security-considerations) for complete guidelines.

## Troubleshooting

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| "XSRF check failed" | Use server-side proxy (see [Developer Guide](DEVELOPER_GUIDE.md#understanding-xsrfcsrf-protection)) |
| "Client must be authenticated" | Verify email/token, check for whitespace |
| "Field cannot be set" | Check field metadata with `/createmeta` endpoint |
| Rate limiting (429) | Implement exponential backoff |

Full troubleshooting guide: [DEVELOPER_GUIDE.md#troubleshooting](DEVELOPER_GUIDE.md#troubleshooting)

## Resources

- 📖 [Developer Guide](DEVELOPER_GUIDE.md) - Complete integration documentation
- 🔗 [Jira Cloud REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- 🔗 [Service Desk API](https://developer.atlassian.com/cloud/jira/service-desk/rest/)
- 🔗 [Authentication Docs](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/)

## Dependencies

This project uses minimal dependencies:

- **express** - Web server framework
- **cors** - CORS middleware for proxy server
- **dotenv** - Environment variable management
- **form-data** - Multipart form data for file uploads
- **multer** - File upload middleware

All dependencies use native Node.js modules where possible for reliability and security.

## Changelog

### Version 2.0.0
- ✨ **New Features:**
  - Attachment upload with multipart form-data support
  - List and download attachments from issues
  - Reporter management (view and update)
  - Email notifications with automatic issue history tracking
- 🔧 **Improvements:**
  - Environment variable configuration support
  - Replaced axios with native Node.js https module
  - Enhanced error handling and user feedback
  - Comprehensive API documentation
- 🧪 **Testing:**
  - Web interface expanded to 8 testing sections
  - Visual feedback for all operations
  - Improved form validation

### Version 1.0.0
- Initial release with core functionality
- Authentication implementation
- Issue creation (regular + Service Desk)
- Workflow transitions
- Comment functionality
- Web-based testing interface

## License

[Specify your license]

## Support

- **Issues**: https://github.com/benjacobs2024/JiraAPIStart/issues
- **Documentation**: https://github.com/benjacobs2024/JiraAPIStart

---

**For Developers**: Start with the [Developer Guide](DEVELOPER_GUIDE.md) for comprehensive integration documentation.
