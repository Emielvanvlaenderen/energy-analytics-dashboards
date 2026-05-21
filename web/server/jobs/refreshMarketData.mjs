#!/usr/bin/env node
/**
 * Upload latest GB day-ahead (Ember) + PV yield (PV_Live) to Supabase Storage.
 *
 * Usage:
 *   node --env-file=.env.local server/jobs/refreshMarketData.mjs
 */
import { executeRefreshMarketData } from '../refreshMarketDataCore.mjs'

const result = await executeRefreshMarketData()
console.log(JSON.stringify(result, null, 2))
process.exit(result.ok ? 0 : 1)
