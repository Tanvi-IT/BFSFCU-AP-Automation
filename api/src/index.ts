/**
 * Function App entry point.
 *
 * Every function module must be imported here so the Functions host
 * registers it. Add one line per new route file.
 */

// --- HTTP routes -----------------------------------------------------------
import './functions/http/auth';
import './functions/http/me';
import './functions/http/invoices';
import './functions/http/attachments';
import './functions/http/workflow';
import './functions/http/vendors';
import './functions/http/users';
import './functions/http/departments';
import './functions/http/exports';
import './functions/http/erp';
import './functions/http/demo';
import './functions/http/integrations';

// --- Queue workers ---------------------------------------------------------
import './functions/queue/processInvoice';

// --- Timer jobs ------------------------------------------------------------
// import './functions/timer/scheduledExport';
