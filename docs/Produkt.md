# Unit Generator

Unit Generator is a planned standalone Tool for adapting requested characters into Tower Defense units within an explicit Game Definition and Profile. Its Engine owns unit generation, source evidence, mechanic interpretation and scoped validation. Unsupported abilities must be reported; extending a game's mechanics requires an explicit Definition change.

The Tool provides an adjustable default Profile and returns inspectable content, evidence and findings. Its CLI has no hidden state between calls. The optional UnitLab uses the same Engine and retains local settings, work and generation history; earlier Results become explicit inputs when reused.

Units must satisfy their declared requirements. Scoped checks alone do not establish balance across a game or player appeal. Towerright or another caller supplies wider evaluation and feedback; Towerright also retains project context and can provide curated Profiles.

Engine, CLI and UnitLab remain in this repository. Implementation starts from scratch; supported mechanics and generation features still need scoping.
