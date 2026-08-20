import { SignIn } from "@clerk/nextjs";

const SignInPage = () => (
  <div className="flex min-h-[70vh] items-center justify-center">
    <SignIn />
  </div>
);

export default SignInPage;
