# VASP-LAMMPS 计算流程

> **注意**
>
> - `INCAR` / `input.in` 由 mtools 分发获得，需要按体系修改具体参数。
> - 特别检查 `input.in` 里的元素顺序：`pair_coeff      * * ML_FF Li Te Al`，按实际修改。
> - `job.sh` 里的 `#SBATCH -J NAME` 改成自己的名字。

## 提交脚本 job.sh

```bash
#!/bin/bash
#SBATCH -J NAME
#SBATCH -n 64
#SBATCH -N 1
#SBATCH -o %j.o
#SBATCH -e %j.e
#SBATCH -p cpu_compute
```

---

## 1. 训练：AIMD 恒温训练（train）

**需要**：`INCAR` `POSCAR` `POTCAR` `KPOINTS` `job.sh`

**产出**：`ML_ABN`

**操作**：

1. 恒温训练 300–600 K 的 ML_ABN 数据（例）。
2. 使用 mlff 指令得到 ML_AB：

   ```bash
   mlff merge 300K/ML_ABN 400K/ML_ABN 500K/ML_ABN 600K/ML_ABN ML_AB
   ```

3. 使用 mtools 将 ML_AB 转换为 select 使用的格式。
4. 复制 ML_AB 到 select 目录。

---

## 2. 重选构型（select）

**需要**：`INCAR` `POSCAR` `POTCAR` `KPOINTS` `ML_AB` `job.sh`

**产出**：`ML_ABN`

**操作**：

1. 修改 INCAR 的 `ML_MB` 参数。
2. 运行。
3. 得到新的 `ML_ABN`。
4. 复制进 refit，改名 `ML_AB`。

---

## 3. 重新拟合（refit）

**需要**：`INCAR` `POSCAR` `POTCAR` `KPOINTS` `ML_AB` `job.sh`

**产出**：`ML_FFN`

**操作**：

1. 设置 INCAR 参数合理。
2. 运行。
3. 得到 `ML_FFN`。
4. 复制进 run，改名 `ML_FF`。

---

## 4. 运行（run）

### 4.1 VASP-run

**需要**：`INCAR` `POSCAR` `POTCAR` `KPOINTS` `ML_FF` `job.sh`

**产出**：MSD 等结果

**操作**：

1. POSCAR 扩胞，晶胞参数大于 25 Å。
2. 修改 INCAR 温度，不高于训练集温度，可以低于。
3. 运行，得到结果。

### 4.2 LAMMPS-run

**需要**：`input.in` `pos.data` `ML_FF` `job.sh`（与 VASP 不同，可由 mtools 得到）

**操作**：

1. pos.data 扩胞，晶胞参数 > 25 Å。
2. 修改 `input.in` 的运行温度、体系元素、迁移离子。
3. 运行，得到结果。

`input.in`：

```lammps
units           metal
atom_style      atomic
boundary        p p p
newton          on
neighbor        2.0 bin
neigh_modify    delay 5 every 1 check yes

# ---------- 参数 ----------

variable        T equal @TEMP@    # 修改温度
variable        dt equal 0.001    # 时间步长 0.001=1fs
variable        seed equal 12345
variable        nstep_npt equal 20000      # npt平衡时间
variable        nstep_nvt equal 5000       # nvt平衡时间
variable        nstep_prod equal 100000    # 生产时间
variable        thermo_step equal 1000     # 热力学采集间隔
variable        dump_step equal 100        # 轨迹采集间隔
variable        msd_step equal 10          # msd采集间隔
variable        P_target equal 1           # 目标压强GPa
timestep        ${dt}

# ---------- 结构与力场 ----------

read_data       pos.data
pair_style      vasp
pair_coeff      * * ML_FF Li Te Al #元素类型，按实际修改

# ---------- 分组与计数 ----------

group           Li_ions type 1 #迁移原子类型编号，按实际修改
variable        total_atoms equal count(all)
variable        li_atoms equal count(Li_ions)
variable        li_percent equal 100*v_li_atoms/v_total_atoms

print "总原子数: ${total_atoms}"
print "Li 离子数: ${li_atoms}"
print "Li 占比: ${li_percent}%"

# ---------- 初始化 ----------
```
