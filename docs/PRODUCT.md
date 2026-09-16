# Unit Generator

Unit Generator is a planned standalone Tool for adapting requested characters into Tower Defense units within an explicit Game Definition and Profile. Its Engine owns unit generation, source evidence, mechanic interpretation and scoped validation. Unsupported abilities must be reported; extending a game's mechanics requires an explicit Definition change.

The Tool provides an adjustable default Profile and returns inspectable content, evidence and findings. Its CLI has no hidden state between calls. The optional UnitLab uses the same Engine and retains local settings, work and generation history; earlier Results become explicit inputs when reused.

Units must satisfy their declared requirements. Scoped checks alone do not establish balance across a game or player appeal. Towerright or another caller supplies wider evaluation and feedback; Towerright also retains project context and can provide curated Profiles.

Engine, CLI and UnitLab remain in this repository. Implementation starts from scratch; supported mechanics and generation features still need scoping.

## Next scope

Choose one useful standalone unit-generation task. Decide:

- what the caller supplies about the character, Definition and Profile, and what optional research or AI may add;
- which mechanics and unit properties the first scope supports, what the default Profile contains and what users can adjust;
- the returned unit content, source evidence and validation findings, including how unsupported abilities are reported;
- which checks the Engine guarantees, which evaluations belong to the caller, and which CLI and optional UnitLab operations are needed first.

Describe one successful Request and Result and one unsupported-mechanic case, with explicit quality requirements. Keep Manga Mayhem's rules in its Definition or Profile. The examples must establish standalone value without Towerright or access to private documentation.
