import { initializeCrawlerSpiders } from "../crawler";

// Registration only: this performs no fetch, timer, schedule, or background work.
// Actual crawler execution remains inside the explicit Fetch Intelligence action.
initializeCrawlerSpiders();
