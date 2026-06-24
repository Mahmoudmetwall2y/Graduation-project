import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, ConfusionMatrixDisplay
from sklearn.utils.class_weight import compute_class_weight
import xgboost as xgb
from imblearn.over_sampling import SMOTE
import joblib
from sklearn.utils.class_weight import compute_sample_weight
import matplotlib.pyplot as plt


# =====================================================================
# 1. LOAD DATASETS EXACTLY AS THEY ARE ON YOUR DISK
# =====================================================================
print("Loading pre-split datasets (CirCor & PhysioNet)...")
# Already split files:
X_circor_train = np.load("X_train_circor.npy")
y_circor_train = np.load("y_train_circor.npy")
X_circor_test  = np.load("X_test_circor.npy")
y_circor_test  = np.load("y_test_circor.npy")

X_phys_train   = np.load("X_train_physio.npy")
y_phys_train   = np.load("y_train_physio.npy")
X_phys_test    = np.load("X_test_physio.npy")
y_phys_test    = np.load("y_test_physio.npy")

print("Loading unified un-split datasets (BUET & Archive)....")
# Global unified files:
X_buet_global    = np.load("X_buet.npy")
y_buet_global    = np.load("y_buet.npy")

X_archive_global = np.load("X_archive.npy")
y_archive_global = np.load("y_archive.npy")

# =====================================================================
# 2. SPLIT ONLY THE UN-SPLIT DATASETS (BUET & ARCHIVE)
# =====================================================================
print("Performing on-the-fly split for BUET and Archive...")
X_buet_train, X_buet_test, y_buet_train, y_buet_test = train_test_split(
    X_buet_global, y_buet_global, test_size=0.2, stratify=y_buet_global, random_state=42
)

X_arch_train, X_arch_test, y_arch_train, y_arch_test = train_test_split(
    X_archive_global, y_archive_global, test_size=0.2, stratify=y_archive_global, random_state=42
)

# =====================================================================
# 3. UNIFY ALL POOLS (STACKING ALL TRAIN TOGETHER AND ALL TEST TOGETHER)
# =====================================================================
# All training sections go here
X_train_pool = np.vstack((X_circor_train, X_phys_train, X_buet_train, X_arch_train))
y_train_pool = np.concatenate((y_circor_train, y_phys_train, y_buet_train, y_arch_train))

# All testing sections go here (Guaranteed 100% clean, un-augmented data)
X_test_pool = np.vstack((X_circor_test, X_phys_test, X_buet_test, X_arch_test))
y_test_pool = np.concatenate((y_circor_test, y_phys_test, y_buet_test, y_arch_test))

# Uniformly encode across the multi-class target labels
encoder = LabelEncoder()
y_train_encoded = encoder.fit_transform(y_train_pool)
y_test_encoded = encoder.transform(y_test_pool)
class_names = encoder.classes_

print("\n" + "="*40)
print(f" Success! Stacking complete.")
print(f"Final Combined Train Shape: {X_train_pool.shape}")
print(f"Final Combined Test Shape : {X_test_pool.shape}")
print("="*40)

# ---> NEW: Create dataset_sources for the combined training pool for per-fold analysis
dataset_sources_train = np.concatenate((
    np.full(len(y_circor_train), 'CirCor'),
    np.full(len(y_phys_train), 'PhysioNet'),
    np.full(len(y_buet_train), 'BUET'),
    np.full(len(y_arch_train), 'Archive')
))

# ======================================
# 2. SETUP CROSS-VALIDATION
# ======================================
kfold = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_accuracies = []

# --- INITIALIZE THESE TO AVOID NAMEERROR ---
best_model = None
best_acc = -1.0
best_y_test = np.array([])
best_y_pred = np.array([])

for fold, (train_idx, val_idx) in enumerate(kfold.split(X_train_pool, y_train_encoded)): # Corrected X and y_encoded usage
    print(f"Training Fold {fold+1}...")

    X_train, X_val = X_train_pool[train_idx], X_train_pool[val_idx] # Corrected X slicing
    y_train, y_val = y_train_encoded[train_idx], y_train_encoded[val_idx] # Corrected y_encoded slicing

    # ---> NEW: Grab the dataset names for this specific validation fold
    sources_val = dataset_sources_train[val_idx] # Using the newly defined dataset_sources_train

    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_val = scaler.transform(X_val)

    target_distribution = {0: int(np.sum(y_train == 0)), 1: int(np.sum(y_train == 1)), 2: int(np.sum(y_train == 2))}

    smote = SMOTE(sampling_strategy=target_distribution, k_neighbors=5, random_state=42)
    X_res, y_res = smote.fit_resample(X_train, y_train)

    weights = compute_class_weight('balanced', classes=np.unique(y_res), y=y_res)
    class_weights = dict(zip(np.unique(y_res), weights))

    #  applies the boost.
    if 1 in class_weights:
        class_weights[1] *= 1.2
    

    s_weights = np.array([class_weights[i] for i in y_res])

    model = xgb.XGBClassifier(
    objective='multi:softprob',
    num_class=3,
    eval_metric=['mlogloss', 'merror'],
    tree_method='hist',          # Faster, memory-efficient histogram-based splitting
    device='cuda',
    # 1. Core Structure Trees
    n_estimators=700,            # Increased from default to capture deep multi-dataset patterns
    learning_rate=0.03,          # Lowered shrinkage rate to prevent overshooting local minima
    max_depth=8,                 # Expanded depth from 4 to 7 to find hidden feature interactions

    # 2. Advanced Regularization against Noise & Feature Overlap
    min_child_weight=3,          # Prevents creating highly specific leaf nodes on small classes (Artifact)
    gamma=0.2,                   # Conservatively lowered from 10 to allow beneficial splitting thresholds
    subsample=0.85,              # Row subsampling prevents single-dataset dominance
    colsample_bytree=0.75,       # Feature subsampling ensures YAMNet and traditional features don't blind each other
    scale_pos_weight=1.5,
    # 3. Class Imbalance Control

    random_state=42,
    use_label_encoder=False
)

    model.fit(

        X_res, y_res,
        sample_weight=s_weights,
        eval_set=[(X_val, y_val)],
        verbose=False

    )

    y_train_pred = model.predict(X_res)
    train_acc = accuracy_score(y_res, y_train_pred)

     # ---> NEW: The Custom Probability Threshold Logic
    y_probs = model.predict_proba(X_val)
    murmur_probs = y_probs[:, 1]

    y_pred = np.zeros(len(y_probs))
    for i in range(len(y_probs)):
        if murmur_probs[i] > 0.254:
             y_pred[i] = 1  # Force Murmur
        else:
            raw_idx = np.argmax([y_probs[i, 0], 0.0, y_probs[i, 2]])
            y_pred[i] = 2 if raw_idx == 2 else 0
    # ---> END NEW THRESHOLD LOGIC

    #y_pred = model.predict(X_val)
    acc = accuracy_score(y_val, y_pred)
    cv_accuracies.append(acc)
    print(f"--- Fold {fold+1} Health Check ---")
    print(f"Training Accuracy:   {train_acc:.4f}")
    print(f"Validation Accuracy: {acc:.4f}")
    

    

    # --- UPDATED SELECTION LOGIC ---
    if acc > best_acc:
        best_acc = acc
        best_model = model
        best_y_test = y_val.copy()   # Use .copy() to ensure data is saved
        best_y_pred = y_pred.copy()
        joblib.dump(scaler, "final_scaler.pkl")

# ======================================
# 3. FINAL RESULTS & VISUALIZATION
# ======================================
print("\n" + "="*30)
print(f"FINAL MEAN ACCURACY: {np.mean(cv_accuracies):.4f}")
print(f"BEST FOLD ACCURACY: {best_acc:.4f}")
print("="*30)



# Only run if we actually caught a best fold
# ======================================
# 3. FINAL RESULTS & VISUALIZATION
# ======================================
if best_y_test.size > 0:
    # 1. THE TRAINING HISTORY GRAPHS
    # results['validation_0'] contains the metrics for the eval_set provided in fit()
    results = best_model.evals_result()

    # Get the number of iterations actually performed (due to early stopping)
    epochs = len(results['validation_0']['mlogloss'])
    x_axis = range(0, epochs)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    # Loss Plot (Log Loss)
    ax1.plot(x_axis, results['validation_0']['mlogloss'], label='Validation Loss', color='#2ecc71')
    ax1.set_title("Log Loss Curve (Optimization)")
    ax1.set_xlabel("Iterations")
    ax1.set_ylabel("Loss")
    ax1.legend()

    # Accuracy Plot (Converted from merror)
    # merror is the percentage of wrong classifications (0 to 1)
    val_acc_curve = [1 - x for x in results['validation_0']['merror']]
    ax2.plot(x_axis, val_acc_curve, label='Validation Accuracy', color='#e74c3c')
    ax2.set_title("Model Accuracy Curve")
    ax2.set_xlabel("Iterations")
    ax2.set_ylabel("Accuracy")
    ax2.legend()

    plt.tight_layout()
    plt.show()

    # 2. THE CLASSIFICATION REPORT
    print("\nClassification Report (Best Fold):")
    print(classification_report(best_y_test, best_y_pred, target_names=class_names))

    # 3. THE CONFUSION MATRIX
    cm = confusion_matrix(best_y_test, best_y_pred)
    plt.figure(figsize=(7, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=class_names, yticklabels=class_names)
    plt.title(f"Confusion Matrix\nBest Fold Accuracy: {best_acc:.2%}")
    plt.xlabel("Predicted Label")
    plt.ylabel("True Label")
    plt.show()


joblib.dump(best_model, "heart_sound_xgboost_model.pkl")
print("\nModel saved successfully.")