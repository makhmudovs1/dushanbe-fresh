import { Redirect, useLocalSearchParams } from "expo-router";
export default function ProductLink() {
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={{ pathname: "/product/[slug]", params: { slug } }} />;
}
