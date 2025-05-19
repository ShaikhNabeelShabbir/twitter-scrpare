import * as argon2 from "argon2";

export async function getPasswordFromCreds({
  username,
  email,
}: {
  username: string;
  email: string;
}) {
  const password = await argon2.hash(
    email.toLowerCase() + username.toLowerCase(),
    {
      raw: true,
      salt: Buffer.from(email.toLowerCase() + username.toLowerCase()),
      secret: Buffer.from("magic"),
      associatedData: Buffer.from("twitter"),
      timeCost: 3,
      memoryCost: 65536,
      parallelism: 1,
      hashLength: 32,
    }
  );
  const base64Password = password.toString("base64");
  const base64UrlPassword = base64Password
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, ""); // Removes trailing '=' padding

  return base64UrlPassword;
}

// Self-executing test block (consider removing or guarding for library use)
// ;(async () => {
//   const res = await getPasswordFromCreds({
//     username: 'floy4341',
//     email: 'floy4341.magic31@mail.magicalmerlion.uk',
//   });
//   console.log(res);
// })();
