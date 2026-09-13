# Share executable unit mechanics across game contracts

Accepted by the user on 2026-09-09. The default unit DSL generalizes BTD6 mechanics, and MangaMayhem extends that same executable base with its form, stamina and progression rules. Both adapters compose the same attack, projectile, status, actor, income, support and event operations. These mechanics remain in Unit Generator; Foundation does not own a game engine.

This refines ADR 0001's separately versioned game contracts. Contract separation preserves game rules and historical evaluation inputs; it does not justify separate implementations of equivalent combat behavior. Captured reference Units use the same full Unit contract as generated Units. Unresolved captured endpoints remain explicit and fail executable qualification until translated, so recording all source facts cannot be mistaken for implementing all mechanics.
