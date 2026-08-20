import { SignUp } from "@clerk/nextjs";

/**
 * Present because Clerk links to it from the sign-in card. Whether anyone can
 * actually create an account is decided in the Clerk dashboard, not here — for
 * a personal tool, restrict sign-ups there.
 */
const SignUpPage = () => (
  <div className="flex min-h-[70vh] items-center justify-center">
    <SignUp />
  </div>
);

export default SignUpPage;
