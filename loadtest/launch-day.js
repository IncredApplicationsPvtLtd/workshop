// k6 load test: simulates a product launch hitting our single t2.micro.
// Run locally: k6 run -e BASE_URL=https://workshop.incred.io -e USERS=300 loadtest/launch-day.js
import http from 'k6/http';
import { sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'https://workshop.incred.io';
const USERS = Number(__ENV.USERS || 300);
const HOLD = __ENV.DURATION || '60s';

export const options = {
  scenarios: {
    launch: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: USERS },   // everyone arrives
        { duration: HOLD, target: USERS },    // peak
        { duration: '10s', target: 0 },       // sale over
      ],
      gracefulRampDown: '5s',
    },
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'max'],
  thresholds: { 'http_req_duration{name:checkout}': ['p(95)>=0'] },
};

export default function () {
  http.get(`${BASE}/`, { tags: { name: 'home' } });
  http.post(`${BASE}/api/checkout`, null, { tags: { name: 'checkout' }, timeout: '15s' });
  sleep(0.5 + Math.random());
}
