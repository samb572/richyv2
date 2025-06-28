const fs = require('fs');
const path = require('path');
// Import the main calculation function and any other utilities from calculations.js
// Fix the path to point correctly to the 'utils' directory
const {
  calculatePaceAdjustment,
  calculateTotalProjectedPoints
} = require('../utils/calculations'); // <--- CRITICAL CHANGE HERE!

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
    // Based on your structure, data is in richyv2/data/
    const dataDirPath = path.join(process.cwd(), 'data'); 

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
    player.player.toLowerCase() === playerName.toLowerCase()
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
  const team = dvpData.nba_dvp_2024_25.teams.find(t =>
    t.team === teamAbbr.toUpperCase()
  );

  if (team && team.defense_vs_position && team.defense_vs_position[position]) {
    return team.defense_vs_position[position];
  }

  console.warn(`DVP data not found for team: ${teamAbbr}, position: ${position}. Using default factors.`);
  return {
    fanduel_points_allowed: 0,
    rank_defense: null,
    dvp_fga_factor: 1.0,
    dvp_fta_factor: 1.0
  };
}

// Main API handler for Next.js API Routes
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Accept');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', message: `Only GET method is supported for ${req.url}` });
  }

  try {
    const {
      player_name,
      opponent_team,
      projected_minutes,
      usage_adjustment,
      player_position
    } = req.query;

    // Critical Validation of Query Parameters
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

    // Load Data
    const { playerStats, teamPace, dvpData } = loadData();

    // Find and Prepare Data for Calculations
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

    const positionToUse = player_position || player.position;
    if (!positionToUse || typeof positionToUse !== 'string' || positionToUse.trim() === '') {
        return res.status(400).json({ error: 'Could not determine player position for DVP calculation.' });
    }

    const dvp = findDVP(dvpData, opponent_team, positionToUse);

    // Construct the 'adjustments' object expected by calculateTotalProjectedPoints
    const adjustments = {
      paceAdjustment: calculatePaceAdjustment(opponentTeam.pace, leagueAvgPace),
      dvpFgaFactor: dvp.dvp_fga_factor,
      dvpFtaFactor: dvp.dvp_fta_factor
    };

    // Construct the 'rawGameParams' object expected by calculateTotalProjectedPoints
    const rawGameParams = {
        projectedMinutes: projected_minutes,
        usageAdjustment: usage_adjustment
    };

    // Perform Calculation using the imported robust function
    const projectionResult = calculateTotalProjectedPoints(
      player,
      rawGameParams,
      adjustments
    );

    // Return Results
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
        projected_minutes: rawGameParams.projectedMinutes,
        usage_adjustment: rawGameParams.usageAdjustment,
        position_used: positionToUse
      },
      projection: projectionResult,
      metadata: {
        calculation_date: new Date().toISOString(),
        data_source: "2024-25 NBA Season Stats"
      }
    });

  } catch (error) {
    console.error('API Error during projection:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during projection calculation',
      message: error.message
    });
  }
}
