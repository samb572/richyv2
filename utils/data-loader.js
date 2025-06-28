// app.js or a relevant component file

import { loadNBAData } from './dataloader.js'; // Adjust path if dataloader.js is elsewhere

async function initializeApp() {
  console.log("Loading NBA data...");
  const nbaData = await loadNBAData();

  if (nbaData.playerStats && nbaData.teamPace && nbaData.dvpData) {
    console.log("NBA data loaded successfully!");

    // Access the loaded data:
    const players = nbaData.playerStats.nba_player_stats_2024_25.players;
    const teamsPace = nbaData.teamPace.nba_team_pace_2024_25.teams;
    const dvp = nbaData.dvpData.nba_dvp_2024_25; // This seems to be the top level key

    // Example: Find Shai Gilgeous-Alexander's stats
    const shaiStats = players.find(player => player.player === "Shai Gilgeous-Alexander");
    console.log("Shai's Stats:", shaiStats);

    // Example: Get Memphis Grizzlies' pace
    const grizzliesPace = teamsPace.find(team => team.team === "MEM");
    console.log("Grizzlies Pace:", grizzliesPace);

    // Example: Get DVP for PG
    const pgDVP = dvp.defense_vs_position.PG;
    console.log("PG DVP:", pgDVP);

    // Now you can use this data in your projection calculations.
  } else {
    console.error("Failed to load all necessary NBA data.");
  }
}

// Call the initialization function when your application starts
initializeApp();
