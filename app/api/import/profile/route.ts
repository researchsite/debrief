import { NextRequest, NextResponse } from 'next/server';
import { parseLinkedInCsv } from '@/lib/linkedin-csv';
import { writeLinkedInArchive, type LinkedInArchive } from '@/lib/graph-writes';


type ProfileRow = Record<string, string> & {
  'First Name': string;
  'Last Name': string;
  Headline: string;
};

type PositionRow = Record<string, string> & {
  'Company Name': string;
  Title: string;
  'Started On': string;
  'Finished On': string;
};

type EducationRow = Record<string, string> & {
  'School Name': string;
  'Degree Name': string;
  'Start Date': string;
  'End Date': string;
};

type SkillRow = Record<string, string> & {
  Name: string;
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const linkedinUrl = formData.get('linkedinUrl');
    if (!linkedinUrl || typeof linkedinUrl !== 'string') {
      return NextResponse.json({ error: 'linkedinUrl is required' }, { status: 400 });
    }

    const archive: LinkedInArchive = {};
    let companiesCount = 0;
    let schoolsCount = 0;
    let skillsCount = 0;

    // Parse Profile.csv
    const profileFile = formData.get('profileCsv');
    if (profileFile && profileFile instanceof File) {
      const text = await profileFile.text();
      const rows = parseLinkedInCsv<ProfileRow>(text, 'First Name');
      if (rows.length > 0) {
        // Strip BOM from first key if needed
        const row = rows[0];
        const headline = row['Headline'] ?? '';
        if (headline) archive.headline = headline;
      }
    }

    // Parse Positions.csv
    const positionsFile = formData.get('positionsCsv');
    if (positionsFile && positionsFile instanceof File) {
      const text = await positionsFile.text();
      const rows = parseLinkedInCsv<PositionRow>(text, 'Company Name');
      const pastCompanies: NonNullable<LinkedInArchive['pastCompanies']> = [];

      for (const row of rows) {
        const name = row['Company Name'];
        const title = row['Title'] ?? '';
        const started = row['Started On'] ?? '';
        const finished = row['Finished On'] ?? '';

        if (!name) continue;

        if (!finished) {
          // Current position
          archive.currentCompany = name;
        } else {
          pastCompanies.push({ name, title, started, ended: finished });
        }
        companiesCount++;
      }
      if (pastCompanies.length > 0) {
        archive.pastCompanies = pastCompanies;
      }
    }

    // Parse Education.csv
    const educationFile = formData.get('educationCsv');
    if (educationFile && educationFile instanceof File) {
      const text = await educationFile.text();
      const rows = parseLinkedInCsv<EducationRow>(text, 'School Name');
      const schools: NonNullable<LinkedInArchive['schools']> = [];

      for (const row of rows) {
        const name = row['School Name'];
        if (!name) continue;
        schools.push({
          name,
          degree: row['Degree Name'] ?? '',
          started: row['Start Date'] ?? '',
          ended: row['End Date'] ?? '',
        });
        schoolsCount++;
      }
      if (schools.length > 0) {
        archive.schools = schools;
      }
    }

    // Parse Skills.csv
    const skillsFile = formData.get('skillsCsv');
    if (skillsFile && skillsFile instanceof File) {
      const text = await skillsFile.text();
      const rows = parseLinkedInCsv<SkillRow>(text, 'Name');
      const skills: string[] = [];

      for (const row of rows) {
        const name = row['Name'];
        if (!name) continue;
        skills.push(name);
        skillsCount++;
      }
      if (skills.length > 0) {
        archive.skills = skills;
      }
    }

    await writeLinkedInArchive(linkedinUrl, archive, 'debrief');

    return NextResponse.json({
      ok: true,
      companies: companiesCount,
      schools: schoolsCount,
      skills: skillsCount,
    });
  } catch (err) {
    console.error('[POST /api/import/profile]', err instanceof Error ? (err.stack ?? err.message) : err);
    return NextResponse.json(
      { error: err instanceof Error && err.message ? err.message : 'Profile import failed' },
      { status: 500 },
    );
  }
}
