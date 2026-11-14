# HARA 2026 rehearsal and replay fixture

This optional local fixture creates two separate events: an unscored rehearsal and, with `--replay`, a completed replay of historical ballots and actual fields. It is intended for review and rehearsal, not as a production migration.

Provide the historical ballot archive and flag images locally; neither is included in this fixture. With a configured development database and administrator, run:

```sh
npm run seed:hara2026 -w apps/api -- --replay --zip /path/to/Hara2026Results.zip --flags /path/to/flags
```

The rehearsal starts in setup with 52 candidates and three judges; the replay contains 2,940 submitted scores. Both use six stages, with Production Number, National Costume and Chukchak as independently judged categories of one shared opening stage. Gown and Deba Teh remain separate scored stages, with the same historical ten-candidate field in the replay. Judge passwords are local fixture credentials printed by the command and must not be used for a real event.

**Historical cut limitation:** the application does not yet implement the actual Top 20 selection or the cross-stage Gown/Deba Teh basis for Top 5. In a rehearsal the automatically proposed field must be reviewed and manually changed before the next stage opens. The replay preserves the actual historical fields; it does not demonstrate automatic historical advancement. Exact historical Gown/Deba Teh weighting is not assumed.

The seeder refuses to replace an event with the same name unless `--replace` is explicitly supplied. That option deletes the matching event and its dependent data; use it only on a disposable database after taking any necessary backup.

The archived reference has been checked against the leading candidate and raw total in each of the eight categories, not every historical rank or the complete cut methodology.
