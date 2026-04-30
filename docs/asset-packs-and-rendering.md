# Asset Packs and Rendering

An asset pack contains a base image and trait layers. Trait layers are addressed by exact `traitName` and `traitValue` pairs.

Rendering is deterministic: the API resolves the token's brand, base image, active traits, and fixed layer order, then composites layers into the final image. The same active trait set should always produce the same visual output.

Keep trait names and values stable after publishing an asset pack because lootbox entries and active trait records depend on those keys.
