const fs = require(‘fs’);
const path = require(‘path’);

// Load JSON data files
function loadData() {
try {
const playerStatsPath = path.join(process.cwd(), ‘data’, ‘nba_player_stats_2024_25.json’);
const teamPacePath = path.join(process.cwd(), ‘data’, ‘nba_team_pace_2024_25.json’);
const dvpPath = path.join(process.cwd(), ‘data’, ‘nba_dvp_2024_25.json’);

```
const playerStats = JSON.parse(fs.readFileSync(playerStatsPath, 'utf8'));
const teamPace = JSON.parse(fs.readFileSync(teamPacePath, 'utf8'));
const dvpData = JSON.parse(fs.readFileSync(dvpPath, 'utf8'));

return { playerStats, teamPace, dvpData };
```

} catch (error) {
console.error(‘Error loading data:’, error);
throw new Error(‘Failed to load NBA data’);
}
}

// Find player in dataset
function findPlayer(playerStats, playerName) {
return playerStats.nba_player_stats_2024_25.players.find(player =>
player.player.toLowerCase().includes(playerName.toLowerCase()) ||
playerName.toLowerCase().includes(player.player.toLowerCase())
);
}

// Find team pace
function findTeamPace(teamPace, teamAbbr) {
return teamPace.nba_team_pace_2024_25.teams.find(team =>
team.team === teamAbbr.toUpperCase()
);
}

// Find DVP data
function findDVP(dvpData, teamAbbr, position) {
const team = dvpData.nba_defense_vs_position_2024_25.teams.find(team =>
team.team === teamAbbr.toUpperCase()
);

if (team && team.defense_vs_position[position]) {
return team.defense_vs_position[position];
}

// Return league average if not found
return {
dvp_fga_factor: 1.0,
dvp_fta_factor: 1.0
};
}

// Main calculation function
function calculateProjectedPoints(playerData, opponentPace, leagueAvgPace, dvpData, projectedMinutes, usageAdjustment) {
try {
// Extract player stats
const {
FGA_36,
FTA_36,
two_point_percentage,
three_point_percentage,
free_throw_percentage,
three_point_attempt_rate
} = playerData;

```
// Calculate pace adjustment
const paceAdj = opponentPace / leagueAvgPace;

// Apply DVP factors
const dvpFgaFactor = dvpData.dvp_fga_factor || 1.0;
const dvpFtaFactor = dvpData.dvp_fta_factor || 1.0;

// Calculate projected attempts
const fgaProj = FGA_36 * (projectedMinutes / 36) * usageAdjustment * dvpFgaFactor * paceAdj;
const ftaProj = FTA_36 * (projectedMinutes / 36) * usageAdjustment * dvpFtaFactor * paceAdj;

// Calculate projected points
const twoPointAttempts = fgaProj * (1 - three_point_attempt_rate);
const threePointAttempts = fgaProj * three_point_attempt_rate;

const pointsFromTwoPointers = twoPointAttempts * two_point_percentage * 2;
const pointsFromThreePointers = threePointAttempts * three_point_percentage * 3;
const pointsFromFreeThrows = ftaProj * free_throw_percentage;

const totalProjectedPoints = pointsFromTwoPointers + pointsFromThreePointers + pointsFromFreeThrows;

return {
  projectedPoints: Math.round(totalProjectedPoints * 10) / 10,
  breakdown: {
    twoPointers: Math.round(pointsFromTwoPointers * 10) / 10,
    threePointers: Math.round(pointsFromThreePointers * 10) / 10,
    freeThrows: Math.round(pointsFromFreeThrows * 10) / 10,
    projectedFGA: Math.round(fgaProj * 10) / 10,
    projectedFTA: Math.round(ftaProj * 10) / 10,
    paceAdjustment: Math.round(paceAdj * 100) / 100
  }
};
```

} catch (error) {
console.error(‘Calculation error:’, error);
throw new Error(‘Failed to calculate projected points’);
}
}

// Main API handler
export default async function handler(req, res) {
// Set CORS headers
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);

if (req.method === ‘OPTIONS’) {
res.status(200).end();
return;
}

if (req.method !== ‘GET’) {
return res.status(405).json({ error: ‘Method not allowed’ });
}

try {
const {
player_name,
opponent_team,
projected_minutes,
usage_adjustment,
player_position
} = req.query;

```
// Validate required parameters
if (!player_name || !opponent_team || !projected_minutes || !usage_adjustment) {
  return res.status(400).json({ 
    error: 'Missing required parameters: player_name, opponent_team, projected_minutes, usage_adjustment' 
  });
}

// Parse numeric inputs
const projMin = parseFloat(projected_minutes);
const usageAdj = parseFloat(usage_adjustment);

if (isNaN(projMin) || isNaN(usageAdj) || projMin <= 0 || usageAdj <= 0) {
  return res.status(400).json({ 
    error: 'Invalid numeric values for projected_minutes or usage_adjustment' 
  });
}

// Load data
const { playerStats, teamPace, dvpData } = loadData();

// Find player
const player = findPlayer(playerStats, player_name);
if (!player) {
  return res.status(404).json({ 
    error: `Player "${player_name}" not found in database` 
  });
}

// Find opponent team pace
const opponentTeam = findTeamPace(teamPace, opponent_team);
if (!opponentTeam) {
  return res.status(404).json({ 
    error: `Team "${opponent_team}" not found in database` 
  });
}

// Get league average pace
const leagueAvgPace = teamPace.nba_team_pace_2024_25.league_average_pace;

// Find DVP data (use player's position if not provided)
const position = player_position || player.position;
const dvp = findDVP(dvpData, opponent_team, position);

// Calculate projected points
const result = calculateProjectedPoints(
  player,
  opponentTeam.pace,
  leagueAvgPace,
  dvp,
  projMin,
  usageAdj
);

// Return results
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
    projected_minutes: projMin,
    usage_adjustment: usageAdj,
    position_used: position
  },
  projection: result,
  metadata: {
    calculation_date: new Date().toISOString(),
    data_source: "2024-25 NBA Season Stats"
  }
});
```

} catch (error) {
console.error(‘API Error:’, error);
res.status(500).json({
error: ‘Internal server error’,
message: error.message
});
}
}
