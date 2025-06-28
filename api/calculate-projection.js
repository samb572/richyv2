const fs = require('fs');
const path = require('path');
// Import the main calculation function and any other utilities from calculations.js
// Make sure calculations.js exports these correctly.
const {
  calculatePaceAdjustment, // We will use this helper directly here
  calculateTotalProjectedPoints // This is the main function we want to use
} = require('./calculations'); // Adjust path if calculations.js is in a different directory

/**
 * @fileoverview API route for calculating NBA player projections.
 * Loads necessary data and orchestrates the projection calculation using
 * functions from 'calculations.js'.
 */

// Load JSON data files (synchronous for API routes, but still good practice to handle errors)
function loadData() {
  try {
    // In a Next.js API route, the `data` directory should ideally be at the root
    // of your project or accessible relative to the API route.
    // `process.cwd()` gets the current working directory (project root).
    const dataDirPath = path.join(process.cwd(), 'data'); // Assuming data folder is directly in project root

    const playerStatsPath = path.join(dataDirPath, 'nba_player_stats_2024_25.json');
    const teamPacePath = path.join(dataDirPath, 'nba_team_pace_2024_25.json');
    const dvpPath = path.join(dataDirPath, 'nba_dvp_2024_25.json');

    const playerStats = JSON.parse(fs.readFileSync(playerStatsPath, 'utf8'));
    const teamPace = JSON.parse(fs.readFileSync(teamPacePath, 'utf8'));
    const dvpData = JSON.parse(fs.readFileSync(dvpPath, 'utf8'));

    return { playerStats, teamPace, dvpData };
  } catch (error) {
    console.error('Error loading data:', error);
    // Re-throw a specific error for API response
    throw new Error(`Failed to load necessary NBA data files: ${error.message}`);
  }
}

/**
 * Finds player data in the loaded dataset.
 * @param {Object} playerStats - The parsed player statistics object.
 * @param {string} playerName - The name of the player to find.
 * @returns {Object|undefined} The player object if found, otherwise undefined.
 */
function findPlayer(playerStats, playerName) {
  return playerStats.nba_player_stats_2024_25.players.find(player =>
    player.player.toLowerCase() === playerName.toLowerCase() // Exact match is usually better for finding
    // If you need partial matching, keep the original includes logic, but exact is less error-prone
    // player.player.toLowerCase().includes(playerName.toLowerCase()) ||
    // playerName.toLowerCase().includes(player.player.toLowerCase())
  );
}

/**
 * Finds team pace data for a given team abbreviation.
 * @param {Object} teamPace - The parsed team pace data object.
 * @param {string} teamAbbr - The team abbreviation (e.g., "MEM").
 * @returns {Object|undefined} The team pace object if found, otherwise undefined.
 */
function findTeamPace(teamPace, teamAbbr) {
  return teamPace.nba_team_pace_2024_25.teams.find(team =>
    team.team === teamAbbr.toUpperCase()
  );
}

/**
 * Finds Defense vs. Position (DVP) data for a specific team and position.
 * @param {Object} dvpData - The parsed DVP data object.
 * @param {string} teamAbbr - The team abbreviation.
 * @param {string} position - The player's position (e.g., "PG", "SF").
 * @returns {Object} The DVP factors for the given position, or default factors if not found.
 */
function findDVP(dvpData, teamAbbr, position) {
  // Ensure dvpData structure matches your JSON
  // Your JSON screenshot showed a structure like: nba_dvp_2024_25.json -> data -> nba_dvp_2024_25 -> teams[] -> team -> defense_vs_position -> {PG: {}, SG: {}}
  const team = dvpData.nba_dvp_2024_25.teams.find(t =>
    t.team === teamAbbr.toUpperCase()
  );

  if (team && team.defense_vs_position && team.defense_vs_position[position]) {
    return team.defense_vs_position[position];
  }

  // Fallback if DVP data for team/position is not found
  console.warn(`DVP data not found for team: ${teamAbbr}, position: ${position}. Using default factors.`);
  return {
    fanduel_points_allowed: 0, // No default points, but factors are important
    rank_defense: null,
    dvp_fga_factor: 1.0,
    dvp_fta_factor: 1.0
  };
}

// Main API handler for Next.js API Routes
export default async function handler(req, res) {
  // Set CORS headers (essential for local development or separate frontend)
  res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust this for production if possible
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Accept');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    // Only allow GET requests for this API route
    return res.status(405).json({ error: 'Method not allowed', message: `Only GET method is supported for ${req.url}` });
  }

  try {
    // Extract parameters from query string
    const {
      player_name,
      opponent_team,
      projected_minutes, // These are still strings from the URL query
      usage_adjustment,   // These are still strings from the URL query
      player_position     // Optional position
    } = req.query;

    // --- Critical Validation of Query Parameters ---
    if (!player_name || typeof player_name !== 'string' || player_name.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid player_name parameter' });
    }
    if (!opponent_team || typeof opponent_team !== 'string' || opponent_team.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid opponent_team parameter' });
    }
    if (!projected_minutes || typeof projected_minutes !== 'string' || projected_minutes.trim() === '') {
        return res.status(400).json({ error: 'Missing projected_minutes parameter' });
    }
    if (!usage_adjustment || typeof usage_adjustment !== 'string' || usage_adjustment.trim() === '') {
        return res.status(400).json({ error: 'Missing usage_adjustment parameter' });
    }

    // --- Load Data ---
    const { playerStats, teamPace, dvpData } = loadData();

    // --- Find and Prepare Data for Calculations ---
    const player = findPlayer(playerStats, player_name);
    if (!player) {
      return res.status(404).json({
        error: `Player "${player_name}" not found in database. Please check spelling.`
      });
    }

    const opponentTeam = findTeamPace(teamPace, opponent_team);
    if (!opponentTeam) {
      return res.status(404).json({
        error: `Opponent team "${opponent_team}" not found in database. Please use a valid NBA team abbreviation.`
      });
    }

    const leagueAvgPace = teamPace.nba_team_pace_2024_25.league_average_pace;
    if (typeof leagueAvgPace !== 'number' || !isFinite(leagueAvgPace) || leagueAvgPace <= 0) {
        throw new Error('League average pace data is invalid or missing.');
    }

    // Determine the position to use for DVP
    const positionToUse = player_position || player.position;
    if (!positionToUse || typeof positionToUse !== 'string' || positionToUse.trim() === '') {
        return res.status(400).json({ error: 'Could not determine player position for DVP calculation.' });
    }

    const dvp = findDVP(dvpData, opponent_team, positionToUse); // This gets the DVP factors (dvp_fga_factor, dvp_fta_factor)

    // Construct the 'adjustments' object expected by calculateTotalProjectedPoints
    const adjustments = {
      paceAdjustment: calculatePaceAdjustment(opponentTeam.pace, leagueAvgPace),
      dvpFgaFactor: dvp.dvp_fga_factor,
      dvpFtaFactor: dvp.dvp_fta_factor
    };

    // Construct the 'rawGameParams' object expected by calculateTotalProjectedPoints
    // These are still strings from req.query, which calculateTotalProjectedPoints will parse.
    const rawGameParams = {
        projectedMinutes: projected_minutes,
        usageAdjustment: usage_adjustment
    };

    // --- Perform Calculation using the imported robust function ---
    // Make sure calculateTotalProjectedPoints is imported from calculations.js
    const projectionResult = calculateTotalProjectedPoints(
      player,        // playerData
      rawGameParams, // rawGameParams with string values
      adjustments    // pre-calculated adjustments
    );

    // --- Return Results ---
    res.status(200).json({
      success: true,
      player: {
        name: player.player,
        team: player.team,
        position: player.position,
        season_avg_ppg: player.points_per_game
      },
      opponent: {
        team: opponent_team.toUpperCase(),
        pace: opponentTeam.pace,
        pace_rank: opponentTeam.rank
      },
      inputs: {
        projected_minutes: rawGameParams.projectedMinutes, // Use the raw string back for display
        usage_adjustment: rawGameParams.usageAdjustment,   // Use the raw string back for display
        position_used: positionToUse
      },
      projection: projectionResult, // This will contain the rounded results
      metadata: {
        calculation_date: new Date().toISOString(),
        data_source: "2024-25 NBA Season Stats"
      }
    });

  } catch (error) {
    // Log the full error for server-side debugging
    console.error('API Error during projection:', error);
    // Return a more user-friendly error message in the response
    res.status(500).json({
      success: false,
      error: 'Internal server error during projection calculation',
      message: error.message // Expose the specific error message from calculations.js
    });
  }
}
