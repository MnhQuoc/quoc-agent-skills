const { parseCursorUsageCsv } = require("../lib/cursorUsageCsv");
const { mergeBillingWithSessions } = require("../lib/billingSessionMatch");

const csv = `Date,Model,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost
"2026-07-22T04:10:05.000Z","claude",1000,5000,2000,800,8800,Included`;

const events = parseCursorUsageCsv(csv);
const mongo = [
  {
    _id: "1",
    runId: "sess-1",
    createdAt: new Date("2026-07-22T04:09:00Z"),
    updatedAt: new Date("2026-07-22T04:12:00Z"),
    userQueries: ["hello"],
    userQueryEvents: [{ text: "hello", at: new Date("2026-07-22T04:09:30Z") }],
    turnCount: 1,
    totalTokens: 100,
    inputTokens: 60,
    outputTokens: 40,
    skillSlug: "cursor-chat",
  },
];

const out = mergeBillingWithSessions(events, mongo);
console.log("events", events.length);
console.log("billed", out.sessions[0].billedTotalTokens);
console.log("stats", out.stats);

const userCsvEvents = [
  {
    eventTime: new Date("2026-07-22T04:26:14.628Z").getTime(),
    totalTokens: 547645,
    inputTokens: 539367,
    outputTokens: 8278,
    model: "composer-2",
  },
  {
    eventTime: new Date("2026-07-22T04:29:54.149Z").getTime(),
    totalTokens: 930198,
    inputTokens: 915466,
    outputTokens: 14732,
    model: "composer-2",
  },
  {
    eventTime: new Date("2026-07-22T04:35:01.691Z").getTime(),
    totalTokens: 2545077,
    inputTokens: 2533155,
    outputTokens: 11922,
    model: "composer-2",
  },
];

const userSession = [
  {
    _id: "user-case",
    runId: "session-user",
    createdAt: new Date("2026-07-22T04:28:00.718Z"),
    updatedAt: new Date("2026-07-22T04:42:13.619Z"),
    userQueries: ["q1", "q2", "q3"],
    userQueryEvents: [
      { text: "q1", at: new Date("2026-07-22T04:25:50.000Z") },
      { text: "q2", at: new Date("2026-07-22T04:29:30.000Z") },
      { text: "q3", at: new Date("2026-07-22T04:34:40.000Z") },
    ],
    turnCount: 3,
    totalTokens: 2371,
    skillSlug: "cursor-chat",
  },
];

const userOut = mergeBillingWithSessions(userCsvEvents, userSession);
console.log("user-case billing events", userOut.sessions[0].billingRequestCount);
console.log("user-case billed total", userOut.sessions[0].billedTotalTokens);
console.log(
  "user-case unmatched",
  userOut.unmatchedEvents.map((row) => new Date(row.eventTime).toISOString())
);
