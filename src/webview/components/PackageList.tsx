import React from "react";
import { PackageWithLatest } from "../../types";
import PackageItem from "./PackageItem";

interface PackageListProps {
  packages: PackageWithLatest[];
  onShowDetails: (pkg: PackageWithLatest) => void;
  filterText?: string;
  selectedPackage?: PackageWithLatest | null;
}

const PackageList: React.FC<PackageListProps> = ({
  packages,
  onShowDetails,
  filterText,
  selectedPackage,
}) => {
  // Filter packages based on search text
  const filteredPackages = filterText
    ? packages.filter((pkg) => {
        const searchLower = filterText.toLowerCase();
        return (
          pkg.name.toLowerCase().includes(searchLower) ||
          pkg.metadata?.description?.toLowerCase().includes(searchLower) ||
          pkg.metadata?.authors?.some((a) =>
            a.toLowerCase().includes(searchLower),
          ) ||
          pkg.metadata?.tags?.some((t) => t.toLowerCase().includes(searchLower))
        );
      })
    : packages;

  return (
    <div className="package-list">
      <div className="package-list-items">
        {filteredPackages.length === 0 && filterText && (
          <div className="no-results">No packages matching "{filterText}"</div>
        )}
        {filteredPackages.map((pkg) => (
          <PackageItem
            key={pkg.name}
            package={pkg}
            onShowDetails={onShowDetails}
            isSelected={selectedPackage?.name === pkg.name}
          />
        ))}
      </div>
    </div>
  );
};

export default PackageList;
