#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)/validation/repos"
mkdir -p "$REPO_DIR"

repos=(
  "Alamofire/Alamofire"
  "onevcat/Kingfisher"
  "ReactiveX/RxSwift"
  "SnapKit/SnapKit"
  "realm/realm-swift"
  "pointfreeco/swift-composable-architecture"
  "Moya/Moya"
  "SwiftyJSON/SwiftyJSON"
  "vapor/vapor"
  "airbnb/lottie-ios"
  "SDWebImage/SDWebImageSwiftUI"
  "apple/swift-nio"
  "pointfreeco/swift-dependencies"
  "apple/swift-collections"
  "apple/swift-algorithms"
)

echo "=== Cloning ${#repos[@]} Swift repos into $REPO_DIR ==="

for repo in "${repos[@]}"; do
  name=$(basename "$repo")
  dest="$REPO_DIR/$name"

  if [ -d "$dest" ]; then
    echo "[$name] Already cloned, skipping"
    continue
  fi

  echo "[$name] Cloning..."
  git clone --depth 1 --quiet "https://github.com/$repo.git" "$dest" || {
    echo "[$name] FAILED to clone"
    continue
  }
  echo "[$name] Done"
done

echo "=== All repos cloned ==="
