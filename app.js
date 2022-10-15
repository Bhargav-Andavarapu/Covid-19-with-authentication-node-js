const express = require("express");

const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//Authentication
const authenticateToken = (request, response, next) => {
  let jwtToken;

  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "my_secret_token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-1 Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserInDB = `
        SELECT
            *
        FROM
            user
        WHERE
            username = "${username}";
    `;
  const dbUser = await db.get(checkUserInDB);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "my_secret_token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-2 Get All States
const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

app.get("/states/", authenticateToken, async (request, response) => {
  const getAllStatesQuery = `
        SELECT
            *
        FROM
            state;
    `;
  const statesArray = await db.all(getAllStatesQuery);
  response.send(
    statesArray.map((eachState) =>
      convertStateDbObjectToResponseObject(eachState)
    )
  );
});

//API-3 Get a State
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getAStateQuery = `
        SELECT
            *
        FROM
            state
        WHERE
            state_id = ${stateId};
    `;
  const stateDetails = await db.get(getAStateQuery);
  response.send(convertStateDbObjectToResponseObject(stateDetails));
});

//API-4 Add a district
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addADistrictQuery = `
        INSERT INTO
            district (district_name, state_id, cases, cured, active, deaths)
        VALUES (
            "${districtName}",
            ${stateId},
            "${cases}",
            "${cured}",
            "${active}",
            "${deaths}"
        );
    `;
  const addDistrict = await db.run(addADistrictQuery);
  const districtId = addDistrict.lastId;
  response.send("District Successfully Added");
});

//API-5 Get a district
const convertDistrictObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getADistrictQuery = `
        SELECT
            *
        FROM
            district
        WHERE
            district_id = ${districtId};
    `;
    const districtDetails = await db.get(getADistrictQuery);
    response.send(convertDistrictObjectToResponseObject(districtDetails));
  }
);

//API-6 Delete a district
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteADistrictQuery = `
        DELETE
        FROM
            district
        WHERE
            district_id = ${districtId};
    `;
    await db.run(deleteADistrictQuery);
    response.send("District Removed");
  }
);

//API-7 Update a district
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateADistrictQuery = `
        UPDATE
            district
        SET
            district_name = "${districtName}",
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths}
        WHERE
            district_id = ${districtId};
    `;
    await db.run(updateADistrictQuery);
    response.send("District Details Updated");
  }
);

//API-8 Get State Stats
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getAStateStatsQuery = `
        SELECT
            SUM(cases) AS totalCases,
            SUM(cured) AS totalCured,
            SUM(active) AS totalActive,
            SUM(deaths) AS totalDeaths
        FROM
            district
        WHERE
            state_id = ${stateId};
    `;
    const stateStats = await db.get(getAStateStatsQuery);
    response.send(stateStats);
  }
);

module.exports = app;
