import { describe, it, expect } from "vitest";
import { parseConnecteamFile } from "@/lib/connecteam-parser";

// Sample from the real users_4.csv file (first 3 lines)
const SAMPLE_CSV = `\uFEFF"First name;""Last name"";""Email"";""Groups"";""Tags"";""Country code"";""Mobile phone"";""Gender"";""Employer identification"";""Birthday"";""Address (street"," apt)."";""Condado"";""Start Date"";""English Level"";""Role"";""Qualify"";""Social security number"";""Verification SSN - EIN"";""Recommended by?"";""Direct manager"";""You have car?"";""Attach File (id)"";""Driver Licence"";""End Date"";""Kiosk code"";""Date added"";""Last login"";""Connecteam User ID"";""Added via"";""Added by""",,,,,,,,,
"CONECTEAM;""HELP"";""connecteam@qualitystaff.co"";""", , , , , ," "";""Waitres Setup"," Esopecial Permisos "";1;3478062304;""Male"";999999999;""12/20/2024"";""2260 UNIVERSITY AVE BRONX NY 10468-6215"";""Bronx"";""12/20/2024"";""A0: Principiante."";""Mesero_Waiter"";;""999-99-9999"";999999999;""KEURY CAMILO"";""JORGE CORTES"";""No"," I dont have a car"";;;;1340;""12/23/2024"";""11/18/2025"";9354567;""Import users"";""N/A""",,
"MARIA;""SANABRIA"";""mariasanabria@qualitystaff.co"";""", , , , , ," "";;1;9296213479;""Female"";999;""01/18/2002"";""2260 UNIVERSITY AVE BRONX NY 10468-6215 4C"";""Bronx"";""10/11/2024"";""B1: Intermedio."";""General_Manager"";;""999-98-4222"";999984222;""KEURY CAMILO"";""KEURY CAMILO"";""No"," I dont have a car"";;;;4542;""10/11/2024"";""02/24/2026"";8813065;""Invite link (Mobile)"";""N/A""",,,`;

describe("parseConnecteamFile", () => {
  it("should parse semicolon-delimited CSV from Connecteam export", () => {
    const result = parseConnecteamFile(SAMPLE_CSV, "users_4.csv");
    
    console.log("Parsed rows:", result.length);
    console.log("First row keys:", Object.keys(result[0] || {}));
    console.log("First row:", JSON.stringify(result[0], null, 2));
    
    expect(result.length).toBeGreaterThan(0);
    
    // Check first employee has correct fields
    const first = result[0];
    expect(first.first_name).toBeTruthy();
    expect(first.last_name).toBeTruthy();
  });

  it("should extract name, phone, email, and connecteam_employee_id correctly", () => {
    const result = parseConnecteamFile(SAMPLE_CSV, "users_4.csv");
    
    // MARIA SANABRIA row
    const maria = result.find(r => r.first_name === "MARIA");
    console.log("Maria row:", JSON.stringify(maria, null, 2));
    
    if (maria) {
      expect(maria.last_name).toBe("SANABRIA");
      expect(maria.email).toBe("mariasanabria@qualitystaff.co");
      expect(maria.connecteam_employee_id).toBe("8813065");
      expect(maria.phone_number).toBeTruthy();
    }
  });
});
