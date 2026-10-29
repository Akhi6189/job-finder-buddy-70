import { describe, it, expect } from "vitest";
import {
  extractSkillTaxonomy,
  calculateNetExperience,
  parseExperienceFromText,
  evaluateProfileAgainstJob,
  scrapeAndParseLinkedInProfile,
  type ParsedLinkedInProfile,
} from "../lib/linkedin-service";

describe("LinkedIn Service Layer & Scraping Utility", () => {
  it("extracts and categorizes skills into domain taxonomy", () => {
    const sampleProfileText = `
      Senior SDET with experience in Java, Python, and TypeScript.
      Automated web testing using Selenium WebDriver, Playwright, and Cypress.
      API test automation with RestAssured, Postman, and Karate.
      CI/CD integration using Jenkins, Docker, Kubernetes, and GitHub Actions on AWS.
      Architected Page Object Model frameworks using BDD Cucumber and TestNG.
      Database testing with PostgreSQL and MySQL.
    `;

    const taxonomy = extractSkillTaxonomy(sampleProfileText);

    expect(taxonomy.languages).toContain("Java");
    expect(taxonomy.languages).toContain("Python");
    expect(taxonomy.languages).toContain("TypeScript");

    expect(taxonomy.automation).toContain("Selenium");
    expect(taxonomy.automation).toContain("Playwright");
    expect(taxonomy.automation).toContain("Cypress");
    expect(taxonomy.automation).toContain("RestAssured");
    expect(taxonomy.automation).toContain("TestNG");
    expect(taxonomy.automation).toContain("Cucumber");

    expect(taxonomy.cicd_devops).toContain("Jenkins");
    expect(taxonomy.cicd_devops).toContain("Docker");
    expect(taxonomy.cicd_devops).toContain("Kubernetes");
    expect(taxonomy.cicd_devops).toContain("AWS");

    expect(taxonomy.frameworks_methodologies).toContain("Page Object Model");
    expect(taxonomy.frameworks_methodologies).toContain("BDD");

    expect(taxonomy.databases_backend).toContain("PostgreSQL");
    expect(taxonomy.tools).toContain("Postman");

    expect(taxonomy.all.length).toBeGreaterThanOrEqual(15);
  });

  it("calculates net non-overlapping experience from career date ranges", () => {
    // 3 overlapping/contiguous roles
    // 1. Jan 2018 to Dec 2020: 36 months
    // 2. Jun 2020 to Dec 2021: overlaps by 6 months, extends to Dec 2021 (total Jan 2018 - Dec 2021 = 48 months)
    // 3. Jan 2022 to Dec 2023: 24 months
    // Net total: 72 months = 6.0 years
    const intervals = [
      { start: new Date("2018-01-01"), end: new Date("2020-12-31") },
      { start: new Date("2020-06-01"), end: new Date("2021-12-31") },
      { start: new Date("2022-01-01"), end: new Date("2023-12-31") },
    ];

    const { totalYears, totalMonths } = calculateNetExperience(intervals);
    expect(totalMonths).toBeGreaterThanOrEqual(70);
    expect(totalYears).toBeGreaterThanOrEqual(5.8);
  });

  it("parses multi-position career history, titles, and highlights from text", () => {
    const rawProfileText = `
      Senior SDET | Cisco Systems
      Jan 2021 - Present
      • Architected API automated test framework using RestAssured and Java
      • Integrated automated test regression suites into Jenkins CI/CD pipeline
      
      QA Automation Engineer | Scopely
      Jul 2018 - Dec 2020
      • Developed UI automation scripts with Selenium and TestNG
      • Maintained Page Object Model architecture across 300+ test suites
    `;

    const { experience, totalYears } = parseExperienceFromText(rawProfileText);

    expect(experience.length).toBeGreaterThanOrEqual(2);
    expect(experience[0].title).toContain("SDET");
    expect(experience[0].company).toContain("Cisco");
    expect(experience[0].isCurrent).toBe(true);
    expect(experience[0].highlights.length).toBeGreaterThanOrEqual(1);

    expect(experience[1].title).toContain("QA Automation");
    expect(experience[1].company).toContain("Scopely");
    expect(experience[1].isCurrent).toBe(false);

    expect(totalYears).toBeGreaterThanOrEqual(5);
  });

  it("evaluates candidate profile against a job opening and computes detailed match metrics", () => {
    const mockProfile: ParsedLinkedInProfile = {
      name: "Akhil Bhadran",
      headline: "Senior SDET / QA Automation Engineer | Bengaluru, India",
      location: "Bengaluru, Karnataka, India",
      about: "Results-driven SDET with 6+ years of test automation experience.",
      currentTitle: "Senior SDET",
      currentCompany: "Cisco Systems",
      totalExperienceYears: 6.2,
      totalExperienceMonths: 74,
      experience: [],
      education: [],
      certifications: [],
      skills: {
        languages: ["Java", "Python", "SQL"],
        automation: ["Selenium", "RestAssured", "TestNG", "Playwright"],
        cicd_devops: ["Jenkins", "Docker", "AWS", "CI/CD"],
        frameworks_methodologies: ["Page Object Model", "BDD", "Agile"],
        databases_backend: ["PostgreSQL"],
        tools: ["Git", "JIRA", "Postman"],
        all: [
          "Java",
          "Python",
          "SQL",
          "Selenium",
          "RestAssured",
          "TestNG",
          "Playwright",
          "Jenkins",
          "Docker",
          "AWS",
          "CI/CD",
          "Page Object Model",
          "BDD",
          "Agile",
          "PostgreSQL",
          "Git",
          "JIRA",
          "Postman",
        ],
      },
      suggestedTargetRoles: [],
      formattedResume: "Resume content",
      sourceType: "text_parsed",
      parsedAt: new Date().toISOString(),
    };

    const targetJob = {
      title: "Senior SDET - Gaming Backend & Automation",
      company: "Scopely",
      location: "Bengaluru, India",
      description:
        "Looking for a Senior SDET with 5+ years experience in Java, RestAssured API testing, Selenium, and CI/CD automation pipelines. Experience in Kubernetes is a plus.",
    };

    const evaluation = evaluateProfileAgainstJob(mockProfile, targetJob);

    expect(evaluation.overallScore).toBeGreaterThanOrEqual(80);
    expect(evaluation.scoreCategory).toBe("Strong Match");
    expect(evaluation.matchedSkills).toContain("Java");
    expect(evaluation.matchedSkills).toContain("RestAssured");
    expect(evaluation.matchedSkills).toContain("Selenium");
    expect(evaluation.experienceComparison.meetsRequirement).toBe(true);
    expect(evaluation.interviewTalkingPoints.length).toBeGreaterThan(0);
  });

  it("scrapes and parses profile context into a structured candidate profile", async () => {
    const profile = await scrapeAndParseLinkedInProfile({
      profileUrl: "https://www.linkedin.com/in/akhil-bhadran",
      rawText: `
        Akhil Bhadran
        Senior SDET / QA Automation Engineer | Bengaluru, Karnataka, India
        
        Experience:
        Senior SDET at Cisco Systems
        Jan 2021 - Present
        Leading automated test frameworks, Selenium, RestAssured, Jenkins.
        
        QA Automation Engineer at Tech Corp
        Jun 2018 - Dec 2020
        Java, TestNG, Appium mobile automation.
      `,
    });

    expect(profile.name).toBe("Akhil Bhadran");
    expect(profile.totalExperienceYears).toBeGreaterThanOrEqual(5);
    expect(profile.skills.all.length).toBeGreaterThan(0);
    expect(profile.suggestedTargetRoles.length).toBeGreaterThan(0);
    expect(profile.suggestedTargetRoles.some((r) => r.role.includes("SDET"))).toBe(true);
  });
});
